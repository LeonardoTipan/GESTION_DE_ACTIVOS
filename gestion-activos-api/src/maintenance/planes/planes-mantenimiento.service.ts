import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvisosService } from '../../audit/avisos.service.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import {
  activoBreve,
  filtroRegistros,
  SELECT_ACTIVO,
} from '../../common/dto/registro.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CrearPlanesMantenimientoDto,
  ModificarPlanMantenimientoDto,
  PlanMantenimientoDto,
  QueryPlanesMantenimientoDto,
  RegistrarVerificacionMantenimientoDto,
  TableroMantenimientosDto,
  VerificacionMantenimientoDto,
} from './dto.js';
import { siguienteFecha } from './frecuencia.js';

const INCLUDE = { activo: SELECT_ACTIVO, _count: { select: { mantenimientos: true } } } as const;
type PlanConActivo = Prisma.PlanMantenimientoGetPayload<{ include: typeof INCLUDE }>;

const aDto = (p: PlanConActivo, ahora = new Date()): PlanMantenimientoDto => {
  const { _count, ...plan } = p;
  return {
    ...plan,
    proximaFecha: plan.proximaFecha as Date,
    activo: activoBreve(plan.activo),
    intervenciones: _count.mantenimientos,
    vencido:
      plan.estado === 'VIGENTE' &&
      !plan.anuladoEn &&
      plan.proximaFecha !== null &&
      plan.proximaFecha < ahora,
  };
};

const VIGENTE = { estado: 'VIGENTE', anuladoEn: null } as const;

/**
 * Capa 1 · Planificación de mantenimientos: qué necesita cada activo y cada
 * cuánto. Un activo tiene a lo sumo un plan vigente de cada tipo. Desde el
 * plan se programa la intervención (capa 2) y la próxima fecha avanza sola.
 */
@Injectable()
export class PlanesMantenimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  async findAll(q: QueryPlanesMantenimientoDto): Promise<Paginated<PlanMantenimientoDto>> {
    const ahora = new Date();
    const where: Prisma.PlanMantenimientoWhereInput = {
      ...filtroRegistros(q),
      tipo: q.tipo,
      estado: q.estado,
      ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
      ...(q.vencidos ? { ...VIGENTE, proximaFecha: { lt: ahora } } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.planMantenimiento.count({ where }),
      this.prisma.planMantenimiento.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ proximaFecha: 'asc' }, { id: 'asc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(filas.map((p) => aDto(p, ahora)), total, q);
  }

  async findOne(id: number): Promise<PlanMantenimientoDto> {
    const plan = await this.prisma.planMantenimiento.findUnique({ where: { id }, include: INCLUDE });
    if (!plan) throw new NotFoundException(`El plan de mantenimiento ${id} no existe.`);
    return aDto(plan);
  }

  async crear(dto: CrearPlanesMantenimientoDto): Promise<PlanMantenimientoDto[]> {
    const { activoIds, ...parametros } = dto;
    for (const id of activoIds) await this.activos.exigirOperativo(id);
    await this.exigirSinPlanVigente(activoIds, dto.tipo);
    const creados = await this.prisma.$transaction((tx) =>
      Promise.all(
        activoIds.map((activoId) =>
          tx.planMantenimiento.create({ data: { ...parametros, activoId }, include: INCLUDE }),
        ),
      ),
    );
    return creados.map((p) => aDto(p));
  }

  async modificar(id: number, dto: ModificarPlanMantenimientoDto, u: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    const tipo = datos.tipo ?? actual.tipo;
    const pasaAVigente = (datos.estado ?? actual.estado) === 'VIGENTE';
    if (pasaAVigente && (datos.estado === 'VIGENTE' || datos.tipo)) {
      await this.activos.exigirOperativo(actual.activoId);
      await this.exigirSinPlanVigente([actual.activoId], tipo, id);
    }
    await this.trazas.modificar('PLAN_MANTENIMIENTO', id, datos, motivoCambio, u.username);
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, u: AuthUser) {
    await this.trazas.anular('PLAN_MANTENIMIENTO', id, motivo, u.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, u: AuthUser) {
    const actual = await this.findOne(id);
    if (actual.estado === 'VIGENTE') {
      await this.exigirSinPlanVigente([actual.activoId], actual.tipo, id);
    }
    await this.trazas.reversar('PLAN_MANTENIMIENTO', id, motivo, u.username);
    return this.findOne(id);
  }

  /**
   * Programa la intervención prevista (capa 2) y adelanta la próxima fecha
   * según la frecuencia (o la deja vacía si el plan era de una sola vez).
   */
  async programar(id: number, fecha?: Date): Promise<{ mantenimientoId: number; plan: PlanMantenimientoDto }> {
    const plan = await this.findOne(id);
    if (plan.anuladoEn || plan.estado !== 'VIGENTE') {
      throw new ConflictException(`El plan ${id} no está vigente.`);
    }
    if (!plan.proximaFecha) {
      throw new ConflictException(`El plan ${id} no tiene más intervenciones previstas.`);
    }
    await this.activos.exigirOperativo(plan.activoId);
    const prevista = new Date(plan.proximaFecha);
    const mantenimientoId = await this.prisma.$transaction(async (tx) => {
      // Condicional: si otra petición ya programó esta fecha, no se duplica.
      const { count } = await tx.planMantenimiento.updateMany({
        where: { id, proximaFecha: prevista, ...VIGENTE },
        data: { proximaFecha: siguienteFecha(prevista, plan.frecuencia) },
      });
      if (count === 0) {
        throw new ConflictException(`El plan ${id} cambió mientras se programaba; vuelve a consultarlo.`);
      }
      const m = await tx.mantenimiento.create({
        data: {
          activoId: plan.activoId,
          planId: id,
          tipo: plan.tipo,
          actividad: plan.actividades.slice(0, 191),
          fecha: fecha ?? prevista,
        },
      });
      return m.id;
    });
    return { mantenimientoId, plan: await this.findOne(id) };
  }

  async tablero(): Promise<TableroMantenimientosDto> {
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + 60 * 24 * 3_600_000);
    const operativo = this.activos.filtroOperativo();
    const sinPlan: Prisma.ActivoWhereInput = {
      AND: [operativo, { planesMantenimiento: { none: { ...VIGENTE, tipo: 'PREVENTIVO' } } }],
    };
    const [planes, programados, activosSinPlan, ejemplos, planesVencidos, pendientesVerificacion] =
      await Promise.all([
        this.prisma.planMantenimiento.findMany({
          where: { ...VIGENTE, proximaFecha: { not: null, lte: limite } },
          include: { activo: SELECT_ACTIVO },
          orderBy: { proximaFecha: 'asc' },
          take: 50,
        }),
        this.prisma.mantenimiento.findMany({
          where: { fase: 'PROGRAMADO', anuladoEn: null, fecha: { lte: limite } },
          include: { activo: SELECT_ACTIVO },
          orderBy: { fecha: 'asc' },
          take: 50,
        }),
        this.prisma.activo.count({ where: sinPlan }),
        this.prisma.activo.findMany({ where: sinPlan, ...SELECT_ACTIVO, orderBy: { codigo: 'asc' }, take: 20 }),
        this.prisma.planMantenimiento.count({ where: { ...VIGENTE, proximaFecha: { lt: ahora } } }),
        this.prisma.mantenimiento.count({
          where: { fase: 'FINALIZADO', anuladoEn: null, verificaciones: { none: { anuladoEn: null } } },
        }),
      ]);
    const proximas = [
      ...planes.map((p) => ({
        origen: 'PLAN' as const,
        id: p.id,
        fecha: p.proximaFecha!,
        tipo: p.tipo,
        activo: activoBreve(p.activo),
        vencido: p.proximaFecha! < ahora,
      })),
      ...programados.map((m) => ({
        origen: 'PROGRAMADO' as const,
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        activo: activoBreve(m.activo),
        vencido: m.fecha < ahora,
      })),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return {
      proximas,
      activosSinPlan,
      ejemplosSinPlan: ejemplos.map(activoBreve),
      planesVencidos,
      pendientesVerificacion,
    };
  }

  private async exigirSinPlanVigente(activoIds: number[], tipo: string, excepto?: number) {
    const con = await this.prisma.planMantenimiento.findMany({
      where: {
        activoId: { in: activoIds },
        tipo: tipo as 'PREVENTIVO' | 'CORRECTIVO',
        ...VIGENTE,
        id: excepto ? { not: excepto } : undefined,
      },
      include: { activo: SELECT_ACTIVO },
    });
    if (con.length > 0) {
      throw new ConflictException(
        `Ya tienen un plan ${tipo.toLowerCase()} vigente: ${con.map((p) => `${p.activo.codigo} (plan ${p.id})`).join(', ')}.`,
      );
    }
  }
}

/**
 * Capa 3 · Verificación y cierre de un mantenimiento FINALIZADO. Un resultado
 * OPERATIVO lo cierra y exige los datos de la ejecución y una evidencia.
 */
@Injectable()
export class VerificacionesMantenimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
    private readonly avisos: AvisosService,
  ) {}

  async listar(mantenimientoId: number): Promise<VerificacionMantenimientoDto[]> {
    return this.prisma.verificacionMantenimiento.findMany({
      where: { mantenimientoId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
  }

  async registrar(
    mantenimientoId: number,
    dto: RegistrarVerificacionMantenimientoDto,
    u: AuthUser,
  ): Promise<VerificacionMantenimientoDto> {
    const m = await this.prisma.mantenimiento.findUnique({
      where: { id: mantenimientoId },
      include: { activo: SELECT_ACTIVO, verificaciones: { where: { anuladoEn: null }, orderBy: { id: 'asc' } } },
    });
    if (!m) throw new NotFoundException(`El mantenimiento ${mantenimientoId} no existe.`);
    if (m.anuladoEn) throw new ConflictException(`El mantenimiento ${mantenimientoId} está anulado.`);
    if (m.fase !== 'FINALIZADO') {
      throw new ConflictException(
        `Solo se verifica un mantenimiento FINALIZADO (este está ${m.fase}).`,
      );
    }
    if (m.verificaciones.at(-1)?.resultado === 'OPERATIVO') {
      throw new ConflictException(`El mantenimiento ${mantenimientoId} ya está cerrado como operativo.`);
    }
    if (m.fechaFin && dto.fecha < m.fechaFin) {
      throw new BadRequestException('La verificación no puede ser anterior al fin del mantenimiento.');
    }
    if (dto.fecha.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException('La fecha de la verificación no puede ser futura.');
    }
    if (dto.resultado === 'OPERATIVO') {
      const faltan = [
        !m.tecnico && 'técnico',
        !m.diagnostico && 'diagnóstico',
        m.duracionMin === null && 'duración',
        !m.resultado && 'actividades realizadas',
        !dto.evidencia && 'evidencia de la verificación',
      ].filter(Boolean);
      if (faltan.length > 0) {
        throw new BadRequestException(
          `No se puede cerrar como operativo: falta ${faltan.join(', ')}.`,
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.verificacionMantenimiento.create({
        data: { ...dto, mantenimientoId, registradoPor: u.username },
      });
      if (dto.resultado === 'NO_SATISFACTORIO') {
        await this.avisos.avisar(
          {
            tipo: 'MANTENIMIENTO_NO_SATISFACTORIO',
            titulo: `Mantenimiento no satisfactorio: ${m.activo.codigo} · ${m.activo.nombre}`,
            mensaje: `La verificación del mantenimiento ${m.id} concluyó que el trabajo no fue satisfactorio. ${dto.observaciones}`,
            activoId: m.activoId,
          },
          tx,
        );
      }
      return v;
    });
  }

  async anular(id: number, motivo: string, u: AuthUser) {
    await this.trazas.anular('VERIFICACION_MANTENIMIENTO', id, motivo, u.username);
    return this.prisma.verificacionMantenimiento.findUniqueOrThrow({ where: { id } });
  }
}
