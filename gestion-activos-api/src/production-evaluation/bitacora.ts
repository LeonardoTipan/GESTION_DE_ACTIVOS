import type { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';
import { esTardia } from './reglas.js';
import { semestreDe, type NumeroSemestre } from './semestres.js';

/**
 * Bitácora General de Evaluación de Sistemas Productivos, con el criterio de la de
 * Mantenimientos: cada evaluación cuenta UNA vez en el semestre PLANIFICADO (su fecha
 * programada de paso a producción); las cerradas cuentan además por su semestre REAL (fecha
 * real de las pruebas). Las anuladas no llegan aquí. Función pura.
 */

export interface EvaluacionBitacora {
  estado: EstadoEvaluacionSistema;
  fechaProgramadaProduccion: Date;
  fechaPruebas: Date | null;
}

export interface ResumenBitacora {
  periodo: { anio: number; semestre: NumeroSemestre | null; etiqueta: string };
  /** Planificadas en el semestre (por fecha programada). */
  planificadas: number;
  /** De ellas, cerradas (con pruebas e informe). */
  cumplidas: number;
  /** De las cumplidas, con las pruebas en o antes de la fecha programada. */
  cumplidasATiempo: number;
  /** De las cumplidas, con las pruebas posteriores (justificadas en la observación). */
  cumplidasTarde: number;
  /** planificadas − cumplidas. */
  pendientes: number;
  /** De las pendientes, con la fecha programada ya pasada. */
  vencidas: number;
  /** Cerradas cuyas pruebas fueron en este semestre REAL (pueden ser de otro semestre planificado). */
  cerradasEnElSemestre: number;
  /** cumplidas / planificadas × 100, 1 decimal; null sin planificadas (nunca una división por cero). */
  cumplimiento: number | null;
}

const porcentaje = (parte: number, todo: number): number | null => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null);

function resumir(
  periodo: ResumenBitacora['periodo'],
  enPeriodo: (fecha: Date) => boolean,
  evaluaciones: EvaluacionBitacora[],
  ahora: Date,
): ResumenBitacora {
  const planificadas = evaluaciones.filter((e) => enPeriodo(e.fechaProgramadaProduccion));
  const cumplidas = planificadas.filter((e) => e.estado === 'CERRADO');
  const tarde = cumplidas.filter((e) => esTardia(e.fechaPruebas, e.fechaProgramadaProduccion)).length;
  const pendientes = planificadas.filter((e) => e.estado !== 'CERRADO');
  return {
    periodo,
    planificadas: planificadas.length,
    cumplidas: cumplidas.length,
    cumplidasATiempo: cumplidas.length - tarde,
    cumplidasTarde: tarde,
    pendientes: pendientes.length,
    vencidas: pendientes.filter((e) => e.fechaProgramadaProduccion.getTime() < ahora.getTime()).length,
    cerradasEnElSemestre: evaluaciones.filter((e) => e.estado === 'CERRADO' && e.fechaPruebas && enPeriodo(e.fechaPruebas)).length,
    cumplimiento: porcentaje(cumplidas.length, planificadas.length),
  };
}

export function bitacoraGeneral(
  anio: number,
  semestres: NumeroSemestre[],
  evaluaciones: EvaluacionBitacora[],
  ahora = new Date(),
  zona?: string,
): { semestres: ResumenBitacora[]; total: ResumenBitacora } {
  const en = (s: NumeroSemestre) => (f: Date) => {
    const x = semestreDe(f, zona);
    return x.anio === anio && x.semestre === s;
  };
  const porSemestre = semestres.map((s) => resumir({ anio, semestre: s, etiqueta: `S${s}-${anio}` }, en(s), evaluaciones, ahora));
  const enAlguno = (f: Date) => semestres.some((s) => en(s)(f));
  const etiqueta = semestres.length === 1 ? `S${semestres[0]}-${anio}` : String(anio);
  const total = resumir({ anio, semestre: semestres.length === 1 ? semestres[0] : null, etiqueta }, enAlguno, evaluaciones, ahora);
  return { semestres: porSemestre, total };
}
