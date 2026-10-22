import { BadRequestException, Injectable } from '@nestjs/common';
import { paginate, skipFor, type Paginated } from '../../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../../common/dto/registro.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rangoDe, semestreDe, type NumeroSemestre } from '../planificacion.js';
import { bitacoraGeneral } from './calculo.js';
import type {
  BitacoraGeneralDto,
  FilaBitacoraDto,
  QueryBitacoraEspecificaDto,
  QueryBitacoraGeneralDto,
} from './dto.js';

const SELECT_PLAN = {
  id: true, frecuencia: true, tipo: true, fechaInicio: true,
  responsable: true, actividades: true, createdAt: true,
} as const;

/** Clave de orden: fecha PLANIFICADA (o prevista, si no hay planificación), la más reciente primero. */
interface Clave {
  origen: 'E' | 'P';
  id: number;
  fecha: Date;
  desempate: number;
}

@Injectable()
export class BitacoraMantenimientoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bitácora General: por semestre del año, cuántas planificaciones hay, cuántas
   * se cumplieron (al menos una ejecución completada), cuántas siguen pendientes,
   * cuántas ejecuciones se completaron (semestre real) y el % de cumplimiento.
   * Los registros anulados no cuentan.
   */
  async general({ anio, semestre }: QueryBitacoraGeneralDto): Promise<BitacoraGeneralDto> {
    const semestres: NumeroSemestre[] = semestre ? [semestre] : [1, 2];
    const { desde, hasta } = rangoDe(anio, semestre);

    const planes = await this.prisma.planMantenimiento.findMany({
      where: { anuladoEn: null, fechaInicio: { gte: desde, lt: hasta } },
      select: { id: true, estado: true, fechaInicio: true },
    });
    // Completadas que cumplen alguno de esos planes (en cualquier fecha real) o cuya
    // fecha real cae en el período (para el conteo por semestre real).
    const ejecuciones = await this.prisma.mantenimiento.findMany({
      where: {
        anuladoEn: null,
        fase: 'FINALIZADO',
        OR: [
          { planId: { in: planes.map((p) => p.id) } },
          { fechaInicio: { gte: desde, lt: hasta } },
        ],
      },
      select: { planId: true, fechaInicio: true, fechaFin: true, fecha: true },
    });

    // Una completada con fecha real fuera del período cumple su planificación, pero
    // no cuenta como ejecución del período: bitacoraGeneral la ubica por su semestre real.
    return bitacoraGeneral(
      anio,
      semestres,
      planes,
      ejecuciones.map((e) => ({ planId: e.planId, fechaReal: e.fechaInicio ?? e.fechaFin ?? e.fecha })),
    );
  }

  /**
   * Bitácora Específica: una fila por ejecución (con lo planificado al lado) y una
   * por cada planificación que aún no tiene ejecuciones. Filtros por año y semestre
   * PLANIFICADOS, activo, tipo, responsable y situación. Paginada.
   */
  async especifica(q: QueryBitacoraEspecificaDto): Promise<Paginated<FilaBitacoraDto>> {
    if (q.semestre && !q.anio) throw new BadRequestException('El semestre exige el año.');
    const rango = q.anio ? rangoDe(q.anio, q.semestre) : undefined;
    const enRango = rango ? { gte: rango.desde, lt: rango.hasta } : undefined;

    const claves: Clave[] = [];

    if (q.situacion !== 'SIN_EJECUCION') {
      const where: Prisma.MantenimientoWhereInput = {
        anuladoEn: null,
        ...(q.activoId ? { activoId: q.activoId } : {}),
        ...(q.tipo ? { tipo: q.tipo } : {}),
        ...(q.situacion ? { fase: q.situacion } : {}),
        AND: [
          ...(enRango
            ? [{ OR: [{ plan: { fechaInicio: enRango } }, { planId: null, fecha: enRango }] }]
            : []),
          ...(q.responsable
            ? [{ OR: [{ plan: { responsable: { contains: q.responsable } } }, { tecnico: { contains: q.responsable } }] }]
            : []),
        ],
      };
      const ejecuciones = await this.prisma.mantenimiento.findMany({
        where,
        select: { id: true, fecha: true, plan: { select: { fechaInicio: true } } },
      });
      for (const e of ejecuciones) {
        claves.push({ origen: 'E', id: e.id, fecha: e.plan?.fechaInicio ?? e.fecha, desempate: e.fecha.getTime() });
      }
    }

    if (!q.situacion || q.situacion === 'SIN_EJECUCION' || q.situacion === 'PROGRAMADO') {
      const planes = await this.prisma.planMantenimiento.findMany({
        where: {
          anuladoEn: null,
          mantenimientos: { none: { anuladoEn: null } },
          ...(q.activoId ? { activoId: q.activoId } : {}),
          ...(q.tipo ? { tipo: q.tipo } : {}),
          ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
          ...(enRango ? { fechaInicio: enRango } : {}),
        },
        select: { id: true, fechaInicio: true },
      });
      for (const p of planes) {
        claves.push({ origen: 'P', id: p.id, fecha: p.fechaInicio, desempate: p.fechaInicio.getTime() });
      }
    }

    claves.sort(
      (a, b) =>
        b.fecha.getTime() - a.fecha.getTime() ||
        b.desempate - a.desempate ||
        a.origen.localeCompare(b.origen) ||
        b.id - a.id,
    );
    const pagina = claves.slice(skipFor(q), skipFor(q) + q.limit);
    const idsE = pagina.filter((c) => c.origen === 'E').map((c) => c.id);
    const idsP = pagina.filter((c) => c.origen === 'P').map((c) => c.id);

    const [ejecuciones, planes] = await Promise.all([
      this.prisma.mantenimiento.findMany({
        where: { id: { in: idsE } },
        include: { activo: SELECT_ACTIVO, plan: { select: SELECT_PLAN } },
      }),
      this.prisma.planMantenimiento.findMany({
        where: { id: { in: idsP } },
        include: { activo: SELECT_ACTIVO },
      }),
    ]);
    const porE = new Map(ejecuciones.map((e) => [e.id, e]));
    const porP = new Map(planes.map((p) => [p.id, p]));

    const filas = pagina.map((c): FilaBitacoraDto => {
      if (c.origen === 'P') {
        const p = porP.get(c.id)!;
        return {
          ...SIN_EJECUCION,
          clave: `P-${p.id}`,
          mantenimientoId: null,
          planId: p.id,
          activo: activoBreve(p.activo),
          situacion: 'SIN_EJECUCION',
          ...deLaPlanificacion(p),
          registradoEn: p.createdAt,
        };
      }
      const e = porE.get(c.id)!;
      return {
        clave: `E-${e.id}`,
        mantenimientoId: e.id,
        planId: e.planId,
        activo: activoBreve(e.activo),
        situacion: e.fase,
        ...(e.plan ? deLaPlanificacion(e.plan) : SIN_PLANIFICACION),
        tipo: e.tipo,
        fechaPrevista: e.fecha,
        fechaLimite: e.fechaLimite,
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
        semestreReal: e.fechaInicio ? semestreDe(e.fechaInicio) : null,
        tecnico: e.tecnico,
        resultado: e.resultado,
        estadoEquipo: e.estadoEquipo,
        observaciones: e.observaciones,
        evidencia: e.evidencia,
        repositorioVerificable: e.repositorioVerificable,
        fechaCancelacion: e.fechaCancelacion,
        registradoEn: e.createdAt,
      };
    });
    return paginate(filas, claves.length, q);
  }
}

type PlanSeleccionado = Prisma.PlanMantenimientoGetPayload<{ select: typeof SELECT_PLAN }>;

function deLaPlanificacion(p: PlanSeleccionado) {
  return {
    periodo: p.frecuencia,
    semestrePlanificado: semestreDe(p.fechaInicio),
    fechaInicioPlanificada: p.fechaInicio,
    tipoPlanificado: p.tipo,
    asignado: p.responsable,
    descripcionPlanificada: p.actividades,
  };
}

const SIN_PLANIFICACION = {
  periodo: null,
  semestrePlanificado: null,
  fechaInicioPlanificada: null,
  tipoPlanificado: null,
  asignado: null,
  descripcionPlanificada: null,
};

const SIN_EJECUCION = {
  tipo: null,
  fechaPrevista: null,
  fechaLimite: null,
  fechaInicio: null,
  fechaFin: null,
  semestreReal: null,
  tecnico: null,
  resultado: null,
  estadoEquipo: null,
  observaciones: null,
  evidencia: null,
  repositorioVerificable: null,
  fechaCancelacion: null,
};
