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
  UpdateRespaldoDto,
} from './dto/capas.dto.js';
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

  /** Corrige el alcance (capa 1). Con la ejecución ya registrada, el alcance es evidencia y no se toca. */
  async update(id: number, dto: UpdateRespaldoDto): Promise<RespaldoDto> {
    const actual = await this.findOne(id);
    if (actual.estadoEjecucion !== 'PENDIENTE') {
      throw new ConflictException(
        `El respaldo ${id} ya tiene la ejecución registrada (${actual.estadoEjecucion}): su alcance no se puede modificar.`,
      );
    }
    const { count } = await this.prisma.respaldo.updateMany({
      where: { id, estadoEjecucion: 'PENDIENTE' },
      data: dto,
    });
    if (count === 0) {
      throw new ConflictException(
        `El respaldo ${id} cambió mientras se editaba; vuelve a consultarlo.`,
      );
    }
    return this.findOne(id);
  }

  /** Borrado definitivo (solo admin). El activo y su bitácora no se ven afectados. */
  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.respaldo.delete({ where: { id } });
  }
}

function conEtapa(respaldo: RespaldoConActivo): RespaldoDto {
  return { ...respaldo, etapa: calcularEtapa(respaldo) };
}
