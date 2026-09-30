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
  CancelarMantenimientoDto,
  FinalizarMantenimientoDto,
  IniciarMantenimientoDto,
  ProgramarMantenimientoDto,
} from './dto/acciones.dto.js';
import type { MantenimientoDto } from './dto/mantenimiento.dto.js';
import type { QueryMantenimientosDto } from './dto/query-mantenimientos.dto.js';
import {
  estaVencido,
  puedeTransicionar,
  TRANSICIONES,
  type AccionMantenimiento,
} from './transiciones.js';

const INCLUDE = {
  activo: { select: { id: true, codigo: true, nombre: true } },
} as const;

type MantenimientoConActivo = Prisma.MantenimientoGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class MantenimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
  ) {}

  async findAll(
    query: QueryMantenimientosDto,
  ): Promise<Paginated<MantenimientoDto>> {
    const ahora = new Date();
    const vencidos: Prisma.MantenimientoWhereInput = {
      fase: 'PROGRAMADO',
      fecha: { lt: ahora },
    };
    const filtros: Prisma.MantenimientoWhereInput[] = [
      {
        activoId: query.activoId,
        tipo: query.tipo,
        fase: query.fase,
        estadoEquipo: query.estadoEquipo,
      },
    ];
    if (query.desde || query.hasta) {
      filtros.push({ fecha: { gte: query.desde, lte: query.hasta } });
    }
    if (query.vencidos === true) filtros.push(vencidos);
    if (query.vencidos === false) filtros.push({ NOT: vencidos });
    if (query.actualizadoDesde) {
      filtros.push({ updatedAt: { gt: query.actualizadoDesde } });
    }
    const where: Prisma.MantenimientoWhereInput = { AND: filtros };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.mantenimiento.count({ where }),
      this.prisma.mantenimiento.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: query.order }, { id: query.order }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(
      filas.map((m) => conVencido(m, ahora)),
      total,
      query,
    );
  }

  async findOne(id: number): Promise<MantenimientoDto> {
    const mantenimiento = await this.prisma.mantenimiento.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!mantenimiento) {
      throw new NotFoundException(`El mantenimiento ${id} no existe.`);
    }
    return conVencido(mantenimiento);
  }

  /** Crea el mantenimiento en fase PROGRAMADO. El activo debe estar vigente. */
  async programar(dto: ProgramarMantenimientoDto): Promise<MantenimientoDto> {
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
    const mantenimiento = await this.prisma.mantenimiento.create({
      data: dto,
      include: INCLUDE,
    });
    return conVencido(mantenimiento);
  }

  async iniciar(
    id: number,
    dto: IniciarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'iniciar');
    return this.aplicar(id, 'iniciar', {
      fechaInicio: dto.fechaInicio ?? new Date(),
    });
  }

  async finalizar(
    id: number,
    dto: FinalizarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'finalizar');
    const fechaFin = dto.fechaFin ?? new Date();
    if (actual.fechaInicio && fechaFin < actual.fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la de inicio.',
      );
    }
    return this.aplicar(id, 'finalizar', {
      resultado: dto.resultado,
      estadoEquipo: dto.estadoEquipo,
      fechaFin,
    });
  }

  async cancelar(
    id: number,
    dto: CancelarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'cancelar');
    return this.aplicar(id, 'cancelar', {
      resultado: dto.motivo,
      fechaFin: new Date(),
    });
  }

  private validarTransicion(
    actual: MantenimientoDto,
    accion: AccionMantenimiento,
  ): void {
    if (!puedeTransicionar(actual.fase, accion)) {
      throw new ConflictException(
        `No se puede ${accion} el mantenimiento ${actual.id}: está en fase ${actual.fase}.`,
      );
    }
  }

  /**
   * Cambia de fase con una actualización condicional: solo se aplica si la
   * fase sigue siendo una de las permitidas. Si otra petición se adelantó, 409.
   */
  private async aplicar(
    id: number,
    accion: AccionMantenimiento,
    data: Prisma.MantenimientoUpdateManyMutationInput,
  ): Promise<MantenimientoDto> {
    const { desde, hacia } = TRANSICIONES[accion];
    const { count } = await this.prisma.mantenimiento.updateMany({
      where: { id, fase: { in: desde } },
      data: { ...data, fase: hacia },
    });
    if (count === 0) {
      throw new ConflictException(
        `El mantenimiento ${id} cambió de fase mientras se procesaba; vuelve a consultarlo.`,
      );
    }
    return this.findOne(id);
  }
}

function conVencido(
  mantenimiento: MantenimientoConActivo,
  ahora = new Date(),
): MantenimientoDto {
  return { ...mantenimiento, vencido: estaVencido(mantenimiento, ahora) };
}
