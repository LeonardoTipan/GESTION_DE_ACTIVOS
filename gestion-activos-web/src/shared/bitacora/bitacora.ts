import type { components } from '../../api/schema'

/** Contrato común de la Bitácora General (lo calcula el backend; aquí no se recalcula). */
export type BitacoraIndicador = components['schemas']['BitacoraIndicadorDto']
export type PeriodoIndicador = components['schemas']['PeriodoIndicadorDto']
export type FrecuenciaBitacora = components['schemas']['IndicadorExcelDto']['frecuencia']

export const ETIQUETA_FRECUENCIA: Record<FrecuenciaBitacora, string> = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
}

/** Nombre del período de la frecuencia (para filtros y textos). */
export const NOMBRE_PERIODO: Record<FrecuenciaBitacora, string> = {
  MENSUAL: 'Mes',
  TRIMESTRAL: 'Trimestre',
  SEMESTRAL: 'Semestre',
}

/** «N/D» sin denominador válido (o período futuro): nunca 0 % inventado. */
export function textoPorcentaje(p: number | null | undefined): string {
  return p === null || p === undefined ? 'N/D' : `${p.toLocaleString('es-EC', { maximumFractionDigits: 1 })} %`
}

export function colorPorcentaje(p: number | null | undefined): string {
  if (p === null || p === undefined) return 'gray'
  return p >= 90 ? 'green' : p >= 70 ? 'yellow' : 'red'
}

/**
 * Variación en puntos porcentuales respecto del período anterior del MISMO año; null si
 * alguno de los dos no tiene porcentaje (no hay datos suficientes para comparar).
 */
export function variacion(periodos: PeriodoIndicador[], indice: number): number | null {
  if (indice <= 0) return null
  const actual = periodos[indice]?.porcentaje
  const anterior = periodos[indice - 1]?.porcentaje
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) return null
  return Math.round((actual - anterior) * 10) / 10
}

export function textoVariacion(v: number | null): string {
  if (v === null) return '—'
  if (v === 0) return '= 0 pp'
  return `${v > 0 ? '▲ +' : '▼ '}${v.toLocaleString('es-EC', { maximumFractionDigits: 1 })} pp`
}

/** Años ofrecidos en los selectores: el siguiente y los cinco anteriores al actual. */
export function aniosBitacora(actual: number): string[] {
  return Array.from({ length: 7 }, (_, i) => String(actual + 1 - i))
}
