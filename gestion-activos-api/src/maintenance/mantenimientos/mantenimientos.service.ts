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
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { IndicadorDto } from '../../common/indicadores/indicador.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CancelarMantenimientoDto,
  EditarMantenimientoDto,
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
import { indicadoresMantenimiento } from './indicadores.js';

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

type MantenimientoConActivo = Prisma.MantenimientoGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class MantenimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
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
    if (!query.incluirAnulados) filtros.push({ anuladoEn: null });
    const where: Prisma.MantenimientoWhereInput = { AND: [...filtros, CON_ACTIVO] };

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
    const mantenimiento = await this.prisma.mantenimiento.findFirst({
      where: { id, ...CON_ACTIVO },
      include: INCLUDE,
    });
    if (!mantenimiento) {
      throw new NotFoundException(`El mantenimiento ${id} no existe.`);
    }
    return conVencido(mantenimiento);
  }

  /** Crea el mantenimiento en fase PROGRAMADO. El activo debe estar vigente. */
  async programar(dto: ProgramarMantenimientoDto): Promise<MantenimientoDto> {
    // Validado aquí, en el backend: la interfaz solo ofrece equipos operativos,
    // pero la regla no depende de ella.
    await this.activos.exigirOperativo(dto.activoId);
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
    if (actual.anuladoEn) {
      throw new ConflictException(`El mantenimiento ${actual.id} está anulado: no admite cambios de fase.`);
    }
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
      where: { id, fase: { in: desde }, anuladoEn: null },
      data: { ...data, fase: hacia },
    });
    if (count === 0) {
      throw new ConflictException(
        `El mantenimiento ${id} cambió de fase mientras se procesaba; vuelve a consultarlo.`,
      );
    }
    return this.findOne(id);
  }


  /**
   * Edita con motivo: sube la versión y conserva la anterior en las trazas.
   * Solo mientras está PROGRAMADO: una vez iniciado, lo planificado es historial.
   */
  async update(
    id: number,
    dto: EditarMantenimientoDto,
    usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    if (actual.anuladoEn) {
      throw new ConflictException(`El mantenimiento ${id} está anulado: reviértelo antes de editarlo.`);
    }
    if (actual.fase !== 'PROGRAMADO') {
      throw new ConflictException(
        `El mantenimiento ${id} está en fase ${actual.fase}: solo se puede editar mientras está PROGRAMADO.`,
      );
    }
    await this.trazas.modificar('MANTENIMIENTO', id, datos, motivoCambio, usuario.username, { fase: 'PROGRAMADO' });
    return this.findOne(id);
  }

  /** Eliminación lógica (solo admin): se conserva y deja de contar en los indicadores. */
  async anular(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.anular('MANTENIMIENTO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Deshace la anulación (solo admin). */
  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.reversar('MANTENIMIENTO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Indicadores del período (por fecha programada); los anulados no cuentan. */
  async indicadores(desde: Date, hasta: Date): Promise<IndicadorDto[]> {
    const registros = await this.prisma.mantenimiento.findMany({
      where: { anuladoEn: null, fecha: { gte: desde, lte: hasta }, ...CON_ACTIVO },
    });
    return indicadoresMantenimiento(registros, new Date());
  }
}

function conVencido(
  mantenimiento: MantenimientoConActivo,
  ahora = new Date(),
): MantenimientoDto {
  return { ...mantenimiento, vencido: estaVencido(mantenimiento, ahora) };
}
