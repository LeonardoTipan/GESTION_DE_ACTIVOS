import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateRespaldoDto,
  RegistrarEjecucionDto,
  RegistrarPruebaDto,
} from './dto/capas.dto.js';
import type { QueryRespaldosDto } from './dto/query-respaldos.dto.js';
import type { RespaldoDto } from './dto/respaldo.dto.js';
import { calcularEtapa, WHERE_POR_ETAPA } from './etapa.js';

const INCLUDE = {
  activo: { select: { id: true, codigo: true, nombre: true } },
} as const;

type RespaldoConActivo = Prisma.RespaldoGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class RespaldosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
  ) {}

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
    const where: Prisma.RespaldoWhereInput = { AND: filtros };

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
    const respaldo = await this.prisma.respaldo.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!respaldo) {
      throw new NotFoundException(`El respaldo ${id} no existe.`);
    }
    return conEtapa(respaldo);
  }

  /** Capa 1: define el alcance. El activo debe existir y estar vigente. */
  async create(dto: CreateRespaldoDto): Promise<RespaldoDto> {
    try {
      await this.activos.findOne(dto.activoId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Es un dato del body, no la ruta: 400 en vez de 404.
        throw new BadRequestException(
          `El activo ${dto.activoId} no existe o fue dado de baja.`,
        );
      }
      throw error;
    }
    const respaldo = await this.prisma.respaldo.create({
      data: dto,
      include: INCLUDE,
    });
    return conEtapa(respaldo);
  }

  /** Capa 2: registra la ejecución (una sola vez). */
  async registrarEjecucion(
    id: number,
    dto: RegistrarEjecucionDto,
  ): Promise<RespaldoDto> {
    const actual = await this.findOne(id);
    if (actual.estadoEjecucion !== 'PENDIENTE') {
      throw new ConflictException(
        `La ejecución del respaldo ${id} ya fue registrada (${actual.estadoEjecucion}).`,
      );
    }
    // Actualización condicional: si otra petición se adelantó, no se sobrescribe.
    const { count } = await this.prisma.respaldo.updateMany({
      where: { id, estadoEjecucion: 'PENDIENTE' },
      data: dto,
    });
    if (count === 0) {
      throw new ConflictException(
        `La ejecución del respaldo ${id} ya fue registrada.`,
      );
    }
    return this.findOne(id);
  }

  /** Capa 3: registra la restauración/prueba (una sola vez, tras ejecución EXITOSA). */
  async registrarPrueba(
    id: number,
    dto: RegistrarPruebaDto,
  ): Promise<RespaldoDto> {
    const actual = await this.findOne(id);
    if (actual.estadoEjecucion !== 'EXITOSA') {
      throw new ConflictException(
        `Solo se puede probar un respaldo con ejecución EXITOSA (actual: ${actual.estadoEjecucion}).`,
      );
    }
    if (actual.estadoPrueba !== 'PENDIENTE') {
      throw new ConflictException(
        `La prueba del respaldo ${id} ya fue registrada (${actual.estadoPrueba}).`,
      );
    }
    if (actual.fechaEjecucion && dto.fechaPrueba < actual.fechaEjecucion) {
      throw new BadRequestException(
        'La fecha de la prueba no puede ser anterior a la de la ejecución.',
      );
    }
    const { count } = await this.prisma.respaldo.updateMany({
      where: { id, estadoEjecucion: 'EXITOSA', estadoPrueba: 'PENDIENTE' },
      data: dto,
    });
    if (count === 0) {
      throw new ConflictException(
        `La prueba del respaldo ${id} ya fue registrada.`,
      );
    }
    return this.findOne(id);
  }
}

function conEtapa(respaldo: RespaldoConActivo): RespaldoDto {
  return { ...respaldo, etapa: calcularEtapa(respaldo) };
}
