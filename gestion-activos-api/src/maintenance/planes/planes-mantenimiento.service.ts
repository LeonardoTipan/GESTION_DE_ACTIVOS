import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MOTIVO_MINIMO } from '../../audit/dto/traza.dto.js';
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
  TableroMantenimientosDto,
} from './dto.js';
import { proximaIntervencion } from './frecuencia.js';
import { exigirIntervalo } from '../../common/plazos/plazos.js';
import { exigirTipoPermitido, rangoDe, semestreDe } from '../planificacion.js';
import type { TipoMantenimiento } from '../../generated/prisma/enums.js';
import type { EventoAgendaDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import { agendaMantenimientos } from './agenda.js';

const INCLUDE = {
  activo: SELECT_ACTIVO,
  // Para contar las ejecuciones (todas) y las completadas, la última finalización real y la
  // ejecución pendiente, sin una consulta por plan.
  mantenimientos: { select: { id: true, fase: true, anuladoEn: true, fechaFin: true } },
} as const;
type PlanConActivo = Prisma.PlanMantenimientoGetPayload<{ include: typeof INCLUDE }>;

/** Ejecuciones que aún no terminaron: un plan tiene a lo sumo una (salvo adicionales justificadas). */
const FASES_PENDIENTES = ['PROGRAMADO', 'EN_EJECUCION'] as const;
const PENDIENTE = { fase: { in: [...FASES_PENDIENTES] }, anuladoEn: null };
const esPendiente = (m: { fase: string; anuladoEn: Date | null }) =>
  (FASES_PENDIENTES as readonly string[]).includes(m.fase) && !m.anuladoEn;

const aDto = (p: PlanConActivo, ahora = new Date()): PlanMantenimientoDto => {
  const { mantenimientos, ...plan } = p;
  const pendiente = mantenimientos.find(esPendiente);
  return {
    ...plan,
    proximaFecha: plan.proximaFecha as Date,
    activo: activoBreve(plan.activo),
    intervenciones: mantenimientos.length,
    ejecucionesCompletadas: mantenimientos.filter((m) => m.fase === 'FINALIZADO' && !m.anuladoEn).length,
    ultimaFinalizacion: proximaIntervencion(plan, mantenimientos).ultimaFinalizacion,
    ejecucionPendienteId: pendiente?.id ?? null,
    semestrePlanificado: semestreDe(plan.fechaInicio),
    // Con una ejecución pendiente, el retraso se ve en esa ejecución, no en el plan.
    vencido:
      plan.estado === 'VIGENTE' &&
      !plan.anuladoEn &&
      !pendiente &&
      plan.proximaFecha !== null &&
      plan.proximaFecha < ahora,
  };
};

const VIGENTE = { estado: 'VIGENTE', anuladoEn: null } as const;
/** Vigente y sin ejecución pendiente: su próxima intervención está «por programar». */
const POR_PROGRAMAR = { ...VIGENTE, mantenimientos: { none: PENDIENTE } } as const;

/** Programar una ejecución desde la planificación (los dos caminos de la interfaz usan esto). */
export interface OpcionesProgramar {
  /** Inicio previsto; por defecto, la próxima intervención del plan. */
  fecha?: Date;
  /** Límite previsto; por defecto, inicio + plazo del plan. */
  fechaLimite?: Date;
  /** Ejecución ADICIONAL (trabajo extra, intervención parcial): exige fecha y justificación. */
  adicional?: boolean;
  justificacion?: string;
}

/**
 * Capa 1 · Planificación de mantenimientos: qué necesita cada activo y cada
 * cuánto. Un activo tiene a lo sumo un plan vigente de cada tipo.
 *
 * PRÓXIMA INTERVENCIÓN: se DERIVA del historial (ver proximaIntervencion): fin REAL de la
 * última ejecución finalizada + período; sin ninguna, la fecha de inicio planificada.
 * Programar o cancelar no la mueven; finalizar, corregir el fin real, anular/revertir una
 * ejecución o cambiar el período/inicio del plan la recalculan (recalcularProxima).
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
      ...(q.vencidos ? { ...POR_PROGRAMAR, proximaFecha: { lt: ahora } } : {}),
    };
    if (q.semestre && !q.anio) throw new BadRequestException('El semestre exige el año.');
    if (q.anio) {
      const { desde, hasta } = rangoDe(q.anio, q.semestre);
      where.fechaInicio = { gte: desde, lt: hasta };
    }
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.planMantenimiento.count({ where }),
      this.prisma.planMantenimiento.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
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

  async crear(dto: CrearPlanesMantenimientoDto, u: AuthUser): Promise<PlanMantenimientoDto[]> {
    const { activoIds, ...parametros } = dto;
    for (const id of activoIds) await this.activos.exigirOperativo(id, 'MANTENIMIENTO');
    await this.exigirTipoParaActivos(activoIds, dto.tipo);
    await this.exigirSinPlanVigente(activoIds, dto.tipo);
    const creados = await this.prisma.$transaction(async (tx) => {
      const planes: PlanConActivo[] = [];
      for (const activoId of activoIds) {
        // La primera intervención prevista es la de la fecha de inicio planificada.
        const p = await tx.planMantenimiento.create({
          data: { ...parametros, proximaFecha: parametros.fechaInicio, activoId },
          include: INCLUDE,
        });
        await this.trazas.registrarAlta(
          tx,
          'PLAN_MANTENIMIENTO',
          p.id,
          { activoId, tipo: p.tipo, frecuencia: p.frecuencia, fechaInicio: p.fechaInicio, responsable: p.responsable, actividades: p.actividades, plazoDias: p.plazoDias, estado: p.estado },
          'Alta de la planificación.',
          u.username,
        );
        planes.push(p);
      }
      return planes;
    });
    return creados.map((p) => aDto(p));
  }

  async modificar(id: number, dto: ModificarPlanMantenimientoDto, u: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    const tipo = datos.tipo ?? actual.tipo;
    if (datos.tipo) await this.exigirTipoParaActivos([actual.activoId], datos.tipo);
    const pasaAVigente = (datos.estado ?? actual.estado) === 'VIGENTE';
    if (pasaAVigente && (datos.estado === 'VIGENTE' || datos.tipo)) {
      await this.activos.exigirOperativo(actual.activoId, 'MANTENIMIENTO');
      await this.exigirSinPlanVigente([actual.activoId], tipo, id);
    }
    await this.trazas.modificar('PLAN_MANTENIMIENTO', id, datos, motivoCambio, u.username);
    // Otro período o inicio: la próxima intervención se recalcula con la MISMA regla (desde el
    // fin real de la última ejecución finalizada; sin ninguna, desde el nuevo inicio).
    if (datos.frecuencia !== undefined || datos.fechaInicio !== undefined) await this.recalcularProxima(id);
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
   * Programa una EJECUCIÓN (fase PROGRAMADO) de la planificación. Es la ÚNICA forma de crear
   * ejecuciones (la usan «Programar» desde el plan y «Nueva ejecución»), así que las reglas
   * son las mismas en los dos caminos:
   * - NO mueve la próxima intervención (se recalcula al finalizar, desde el fin real);
   * - una sola ejecución pendiente por plan; una adicional exige fecha y justificación, que
   *   queda en la auditoría (alta de la ejecución);
   * - sin fecha, la próxima intervención del plan (ÚNICA ya ejecutada: solo adicional).
   * El plan se bloquea (SELECT … FOR UPDATE) para que dos peticiones simultáneas no creen dos.
   */
  async programar(id: number, opciones: OpcionesProgramar, u: AuthUser): Promise<{ mantenimientoId: number; plan: PlanMantenimientoDto }> {
    const { fecha, fechaLimite, adicional = false } = opciones;
    const justificacion = opciones.justificacion?.trim() ?? '';
    const plan = await this.findOne(id);
    if (plan.anuladoEn || plan.estado !== 'VIGENTE') {
      throw new ConflictException(`La planificación ${id} no está vigente.`);
    }
    if (adicional && (!fecha || justificacion.length < MOTIVO_MINIMO)) {
      throw new BadRequestException(
        `Una ejecución adicional exige su fecha prevista y la justificación (al menos ${MOTIVO_MINIMO} caracteres).`,
      );
    }
    if (!adicional && !fecha && !plan.proximaFecha) {
      throw new ConflictException(
        `La planificación ${id} no tiene más intervenciones previstas: registre una ejecución adicional justificada si hace falta.`,
      );
    }
    await this.activos.exigirOperativo(plan.activoId, 'MANTENIMIENTO');
    const inicio = fecha ?? new Date(plan.proximaFecha);
    const limite = fechaLimite ?? new Date(inicio.getTime() + (plan.plazoDias ?? 7) * 86_400_000);
    exigirIntervalo(inicio, limite, 'Mantenimiento');
    const mantenimientoId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM plan_mantenimiento WHERE id = ${id} FOR UPDATE`;
      const pendiente = await tx.mantenimiento.findFirst({ where: { planId: id, ...PENDIENTE }, select: { id: true } });
      if (pendiente && !adicional) {
        throw new ConflictException(
          `La planificación ${id} ya tiene la ejecución #${pendiente.id} pendiente: finalícela o cancélela, o registre una ejecución adicional justificada.`,
        );
      }
      const m = await tx.mantenimiento.create({
        data: {
          activoId: plan.activoId,
          planId: id,
          tipo: plan.tipo,
          actividad: plan.actividades.slice(0, 191),
          fecha: inicio,
          fechaLimite: limite,
        },
      });
      await this.trazas.registrarAlta(
        tx,
        'MANTENIMIENTO',
        m.id,
        { planId: id, activoId: m.activoId, tipo: m.tipo, fecha: m.fecha, fechaLimite: m.fechaLimite, fase: m.fase },
        adicional ? `Ejecución adicional: ${justificacion}`.slice(0, 5000) : 'Ejecución programada desde la planificación.',
        u.username,
      );
      return m.id;
    });
    return { mantenimientoId, plan: await this.findOne(id) };
  }

  /**
   * Recalcula la próxima intervención desde el historial (fin real de la última ejecución
   * finalizada y no anulada + período). Es un dato DERIVADO: no sube la versión del plan ni
   * genera traza propia (la traza está en la ejecución que lo provocó). Idempotente.
   */
  async recalcularProxima(planId: number, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    const plan = await tx.planMantenimiento.findUnique({
      where: { id: planId },
      select: { fechaInicio: true, frecuencia: true, proximaFecha: true, mantenimientos: { select: { fase: true, fechaFin: true, anuladoEn: true } } },
    });
    if (!plan) return;
    const { proximaFecha } = proximaIntervencion(plan, plan.mantenimientos);
    if ((proximaFecha?.getTime() ?? null) !== (plan.proximaFecha?.getTime() ?? null)) {
      await tx.planMantenimiento.update({ where: { id: planId }, data: { proximaFecha } });
    }
  }

  /** Agenda de las dos fases (planificación y ejecución) en un rango, con los filtros del calendario. */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const rango = { gte: q.desde, lte: q.hasta };
    const deActivo = q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {};
    const contiene = q.responsable ? { contains: q.responsable } : undefined;
    const [mantenimientos, planes] = await Promise.all([
      this.prisma.mantenimiento.findMany({
        where: {
          anuladoEn: null,
          ...deActivo,
          ...(contiene ? { tecnico: contiene } : {}),
          OR: [
            { fecha: { lte: q.hasta }, OR: [{ fechaLimite: { gte: q.desde } }, { fechaLimite: null, fecha: { gte: q.desde } }] },
            { fechaInicio: rango },
            { fechaFin: rango },
          ],
        },
        include: { activo: SELECT_ACTIVO },
        take: 2000,
      }),
      this.prisma.planMantenimiento.findMany({
        where: { ...POR_PROGRAMAR, proximaFecha: { not: null, lte: q.hasta }, ...deActivo, ...(contiene ? { responsable: contiene } : {}) },
        include: { activo: SELECT_ACTIVO },
      }),
    ]);
    const eventos = agendaMantenimientos({
      mantenimientos: mantenimientos.map((m) => ({ ...m, activo: activoBreve(m.activo) })),
      planes: planes.map((p) => ({ ...p, activo: activoBreve(p.activo) })),
      desde: q.desde,
      hasta: q.hasta,
      ahora: new Date(),
      capa: q.capa,
    });
    return q.estado ? eventos.filter((e) => e.estado === q.estado) : eventos;
  }

  async tablero(): Promise<TableroMantenimientosDto> {
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + 60 * 24 * 3_600_000);
    const operativo = this.activos.filtroOperativo();
    const sinPlan: Prisma.ActivoWhereInput = {
      AND: [operativo, { planesMantenimiento: { none: { ...VIGENTE, tipo: 'PREVENTIVO' } } }],
    };
    const [planes, programados, activosSinPlan, ejemplos, planesVencidos] =
      await Promise.all([
        this.prisma.planMantenimiento.findMany({
          where: { ...POR_PROGRAMAR, proximaFecha: { not: null, lte: limite } },
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
        this.prisma.planMantenimiento.count({ where: { ...POR_PROGRAMAR, proximaFecha: { lt: ahora } } }),
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
    };
  }

  /** Tipo permitido para la clase (hardware/software) de la categoría de cada activo. */
  private async exigirTipoParaActivos(activoIds: number[], tipo: TipoMantenimiento): Promise<void> {
    const activos = await this.prisma.activo.findMany({
      where: { id: { in: activoIds } },
      select: { codigo: true, categoria: { select: { nombre: true, claseMantenimiento: true } } },
    });
    for (const a of activos) exigirTipoPermitido(tipo, a);
  }

  private async exigirSinPlanVigente(activoIds: number[], tipo: string, excepto?: number) {
    const con = await this.prisma.planMantenimiento.findMany({
      where: {
        activoId: { in: activoIds },
        tipo: tipo as TipoMantenimiento,
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
