import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { QueryRespaldosDto } from './dto/query-respaldos.dto.js';
import type { RespaldoDto } from './dto/respaldo.dto.js';
import { calcularEtapa, WHERE_POR_ETAPA } from './etapa.js';

const INCLUDE = {
  activo: { select: { id: true, codigo: true, nombre: true } },
} as const;

/**
 * Solo registros cuyo activo existe. Las claves foráneas lo garantizan, pero si
 * alguien vacía la tabla de activos saltándoselas, un registro huérfano haría
 * fallar la consulta entera (el activo es obligatorio): se ignora en vez de
 * tumbar el módulo. La sincronización con GLPI los detecta y los denuncia.
 */
const CON_ACTIVO = { activo: { id: { gt: 0 } } } as const;

type RespaldoConActivo = Prisma.RespaldoGetPayload<{ include: typeof INCLUDE }>;

/**
 * Registros ANTERIORES al plan de respaldo (modelo de tres capas en un solo
 * registro). Se conservan intactos y solo se consultan: no tienen los datos
 * que exige el plan (frecuencia, medio, RPO…) y convertirlos obligaría a
 * inventarlos. Lo nuevo se registra en planes, ejecuciones y restauraciones.
 */
@Injectable()
export class RespaldosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryRespaldosDto): Promise<Paginated<RespaldoDto>> {
    const filtros: Prisma.RespaldoWhereInput[] = [
      {
        activoId: query.activoId,
        estadoEjecucion: query.estadoEjecucion,
        estadoPrueba: query.estadoPrueba,
      },
    ];
    if (query.etapa) {
      filtros.push(WHERE_POR_ETAPA[query.etapa]);
    }
    if (query.actualizadoDesde) {
      filtros.push({ updatedAt: { gt: query.actualizadoDesde } });
    }
    const where: Prisma.RespaldoWhereInput = { AND: [...filtros, CON_ACTIVO] };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.respaldo.count({ where }),
      this.prisma.respaldo.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(conEtapa), total, query);
  }

  async findOne(id: number): Promise<RespaldoDto> {
    const respaldo = await this.prisma.respaldo.findFirst({
      where: { id, ...CON_ACTIVO },
      include: INCLUDE,
    });
    if (!respaldo) {
      throw new NotFoundException(`El respaldo ${id} no existe.`);
    }
    return conEtapa(respaldo);
  }
}

function conEtapa(respaldo: RespaldoConActivo): RespaldoDto {
  return { ...respaldo, etapa: calcularEtapa(respaldo) };
}
