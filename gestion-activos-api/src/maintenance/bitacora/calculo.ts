import type { EstadoPlan } from '../../generated/prisma/enums.js';
import { cumplimiento, semestreDe, type NumeroSemestre } from '../planificacion.js';

/**
 * Cálculo de la Bitácora General (funciones puras, sin base de datos).
 *
 * Unidad: la PLANIFICACIÓN, contada en el semestre de su fecha de inicio
 * planificada (aunque se ejecute después: planificada en junio y ejecutada en
 * julio sigue siendo del S1 planificado). Una planificación está cumplida si
 * tiene AL MENOS una ejecución completada (finalizada, no anulada): varias
 * ejecuciones de la misma planificación no la cuentan dos veces.
 *
 * Las ejecuciones completadas se cuentan aparte, en el semestre REAL (fecha real
 * de mantenimiento), e incluyen las que no tienen planificación.
 */

export interface PlanParaBitacora {
  id: number;
  estado: EstadoPlan;
  fechaInicio: Date;
}

export interface EjecucionCompletada {
  planId: number | null;
  /** Fecha real de mantenimiento (inicio real). */
  fechaReal: Date;
}

/** Un semestre o, para el total, el año entero (semestre null). */
export interface Periodo {
  anio: number;
  semestre: NumeroSemestre | null;
  etiqueta: string;
}

export interface ResumenSemestre {
  periodo: Periodo;
  /** Planificaciones (no anuladas) del semestre planificado. */
  planificadas: number;
  /** Suspendidas sin ejecución completada: no son exigibles y salen del cálculo. */
  suspendidas: number;
  /** planificadas − suspendidas: el denominador del cumplimiento. */
  esperadas: number;
  /** Planificaciones con al menos una ejecución completada. */
  cumplidas: number;
  /** esperadas − cumplidas. */
  pendientes: number;
  /** Ejecuciones completadas cuyo semestre REAL es este (con o sin planificación). */
  ejecucionesCompletadas: number;
  /** De ellas, las que no proceden de una planificación (registros anteriores). */
  ejecucionesSinPlanificacion: number;
  /** cumplidas / esperadas × 100 (1 decimal); null si no hay ninguna esperada. */
  cumplimiento: number | null;
}

function vacio(periodo: Periodo): ResumenSemestre {
  return {
    periodo,
    planificadas: 0,
    suspendidas: 0,
    esperadas: 0,
    cumplidas: 0,
    pendientes: 0,
    ejecucionesCompletadas: 0,
    ejecucionesSinPlanificacion: 0,
    cumplimiento: null,
  };
}

function cerrar(r: ResumenSemestre): ResumenSemestre {
  r.esperadas = r.planificadas - r.suspendidas;
  r.pendientes = r.esperadas - r.cumplidas;
  r.cumplimiento = cumplimiento(r.cumplidas, r.esperadas);
  return r;
}

/**
 * Resumen de cada semestre pedido (de un año) y el total del año.
 * `planes` y `ejecuciones` pueden traer de más: se filtran por semestre aquí.
 * `ejecuciones` son TODAS las completadas de esos planes y del período real.
 */
export function bitacoraGeneral(
  anio: number,
  semestres: readonly NumeroSemestre[],
  planes: readonly PlanParaBitacora[],
  ejecuciones: readonly EjecucionCompletada[],
  zona?: string,
): { semestres: ResumenSemestre[]; total: ResumenSemestre } {
  const cumplidos = new Set(ejecuciones.flatMap((e) => (e.planId === null ? [] : [e.planId])));
  const filas = new Map(
    semestres.map((s) => [s, vacio({ anio, semestre: s, etiqueta: `S${s}-${anio}` })] as const),
  );

  for (const plan of planes) {
    const s = semestreDe(plan.fechaInicio, zona);
    const fila = s.anio === anio ? filas.get(s.semestre) : undefined;
    if (!fila) continue;
    fila.planificadas++;
    if (cumplidos.has(plan.id)) fila.cumplidas++;
    else if (plan.estado === 'SUSPENDIDO') fila.suspendidas++;
  }
  for (const ejecucion of ejecuciones) {
    const s = semestreDe(ejecucion.fechaReal, zona);
    const fila = s.anio === anio ? filas.get(s.semestre) : undefined;
    if (!fila) continue;
    fila.ejecucionesCompletadas++;
    if (ejecucion.planId === null) fila.ejecucionesSinPlanificacion++;
  }

  const resumenes = [...filas.values()].map(cerrar);
  const total = vacio({
    anio,
    semestre: semestres.length === 1 ? semestres[0] : null,
    etiqueta: semestres.length === 1 ? `S${semestres[0]}-${anio}` : String(anio),
  });
  for (const r of resumenes) {
    total.planificadas += r.planificadas;
    total.suspendidas += r.suspendidas;
    total.cumplidas += r.cumplidas;
    total.ejecucionesCompletadas += r.ejecucionesCompletadas;
    total.ejecucionesSinPlanificacion += r.ejecucionesSinPlanificacion;
  }
  return { semestres: resumenes, total: cerrar(total) };
}
