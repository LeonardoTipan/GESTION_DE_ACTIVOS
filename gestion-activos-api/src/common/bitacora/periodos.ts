import { instanteLocal, zonaHoraria } from '../plazos/plazos.js';

/**
 * Períodos de las Bitácoras institucionales («Indicadores de seguimiento de Tecnología.xlsx»):
 * meses, trimestres o semestres de un año, en la hora de la institución. Funciones puras.
 */
export const FRECUENCIAS_BITACORA = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL'] as const;
export type FrecuenciaBitacora = (typeof FRECUENCIAS_BITACORA)[number];

/** CERRADO: ya terminó · EN_CURSO: contiene hoy (cifras parciales) · FUTURO: sin datos todavía. */
export const SITUACIONES_PERIODO = ['CERRADO', 'EN_CURSO', 'FUTURO'] as const;
export type SituacionPeriodo = (typeof SITUACIONES_PERIODO)[number];

export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface PeriodoBitacora {
  /** «2026-03», «2026-T1» o «2026-S1». */
  clave: string;
  /** «Marzo», «T1 · ene–mar» o «S1 · ene–jun». */
  etiqueta: string;
  /** Primer instante del período (incluido). */
  desde: Date;
  /** Primer instante del período siguiente (excluido). */
  hasta: Date;
  situacion: SituacionPeriodo;
}

/** Meses que abarca un período de la frecuencia. */
export const mesesPorPeriodo = (f: FrecuenciaBitacora): number => (f === 'MENSUAL' ? 1 : f === 'TRIMESTRAL' ? 3 : 6);

/** Número de períodos en el año (12, 4 o 2). */
export const periodosPorAnio = (f: FrecuenciaBitacora): number => 12 / mesesPorPeriodo(f);

const inicioDeMes = (anio: number, mes: number, zona: string): Date => {
  const a = anio + Math.floor((mes - 1) / 12);
  const m = ((mes - 1) % 12) + 1;
  return instanteLocal(`${a}-${String(m).padStart(2, '0')}-01`, 0, zona);
};

/** El período `numero` (1…12, 1…4 o 1…2) del año. */
export function periodoBitacora(
  anio: number,
  frecuencia: FrecuenciaBitacora,
  numero: number,
  ahora = new Date(),
  zona = zonaHoraria(),
): PeriodoBitacora {
  const n = mesesPorPeriodo(frecuencia);
  const mesInicio = (numero - 1) * n + 1;
  const desde = inicioDeMes(anio, mesInicio, zona);
  const hasta = inicioDeMes(anio, mesInicio + n, zona);
  const situacion: SituacionPeriodo = ahora >= hasta ? 'CERRADO' : ahora >= desde ? 'EN_CURSO' : 'FUTURO';
  const rango = `${MES_CORTO[mesInicio - 1]}–${MES_CORTO[mesInicio + n - 2]}`;
  const [clave, etiqueta] =
    frecuencia === 'MENSUAL'
      ? [`${anio}-${String(numero).padStart(2, '0')}`, NOMBRES_MES[numero - 1]]
      : frecuencia === 'TRIMESTRAL'
        ? [`${anio}-T${numero}`, `T${numero} · ${rango}`]
        : [`${anio}-S${numero}`, `S${numero} · ${rango}`];
  return { clave, etiqueta, desde, hasta, situacion };
}

/** Todos los períodos del año, en orden. */
export function periodosDelAnio(anio: number, frecuencia: FrecuenciaBitacora, ahora = new Date(), zona = zonaHoraria()): PeriodoBitacora[] {
  return Array.from({ length: periodosPorAnio(frecuencia) }, (_, i) => periodoBitacora(anio, frecuencia, i + 1, ahora, zona));
}

/** [desde, hasta) del año entero. */
export function rangoAnio(anio: number, zona = zonaHoraria()): { desde: Date; hasta: Date } {
  return { desde: inicioDeMes(anio, 1, zona), hasta: inicioDeMes(anio + 1, 1, zona) };
}

/** parte ÷ todo × 100 con 1 decimal; null sin denominador (nunca una división por cero). */
export function porcentajeBitacora(parte: number | null, todo: number | null): number | null {
  if (parte === null || todo === null || todo <= 0) return null;
  return Math.round((parte / todo) * 1000) / 10;
}
