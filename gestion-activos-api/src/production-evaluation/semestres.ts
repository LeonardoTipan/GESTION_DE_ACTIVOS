import { diaLocal, instanteLocal, zonaHoraria } from '../common/plazos/plazos.js';

/**
 * Semestres en la hora de la institución (S1 ene–jun, S2 jul–dic), con el mismo criterio
 * que la bitácora de Mantenimientos. Se repiten aquí (dos funciones puras) para que el
 * módulo no dependa de Mantenimientos.
 */
export type NumeroSemestre = 1 | 2;

export interface Semestre {
  anio: number;
  semestre: NumeroSemestre;
  etiqueta: string;
}

export function semestreDe(fecha: Date, zona = zonaHoraria()): Semestre {
  const [anio, mes] = diaLocal(fecha, zona).split('-').map(Number);
  const semestre: NumeroSemestre = mes <= 6 ? 1 : 2;
  return { anio, semestre, etiqueta: `S${semestre}-${anio}` };
}

/** [desde, hasta) del semestre (o del año entero), en instantes, según la hora de la institución. */
export function rangoDe(anio: number, semestre?: NumeroSemestre, zona = zonaHoraria()): { desde: Date; hasta: Date } {
  const mesInicio = semestre === 2 ? 7 : 1;
  const finAnio = semestre === 1 ? `${anio}-07-01` : `${anio + 1}-01-01`;
  return {
    desde: instanteLocal(`${anio}-${String(mesInicio).padStart(2, '0')}-01`, 0, zona),
    hasta: instanteLocal(finAnio, 0, zona),
  };
}
