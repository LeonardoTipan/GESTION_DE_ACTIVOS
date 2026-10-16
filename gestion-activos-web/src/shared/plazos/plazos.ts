import dayjs from 'dayjs'

/**
 * La misma regla que la API (common/plazos): dónde cae una fecha real respecto
 * al intervalo previsto. Sirve para avisar ANTES de enviar; quien decide es la API.
 */
export type Posicion = 'EN_PLAZO' | 'ANTES' | 'DESPUES' | 'SIN_PLAZO'

export function posicionEnPlazo(real: string | Date, inicio?: string | Date | null, limite?: string | Date | null): Posicion {
  if (!inicio && !limite) return 'SIN_PLAZO'
  const r = dayjs(real)
  if (inicio && r.isBefore(dayjs(inicio))) return 'ANTES'
  if (limite && r.isAfter(dayjs(limite))) return 'DESPUES'
  return 'EN_PLAZO'
}

export const fmt = (d: string | Date | null | undefined) => (d ? dayjs(d).format('DD MMM YYYY HH:mm') : '—')

/** Texto del aviso, o null si está en plazo. */
export function avisoFueraDePlazo(que: string, real: string | Date | null, inicio?: string | Date | null, limite?: string | Date | null): string | null {
  if (!real) return null
  const p = posicionEnPlazo(real, inicio, limite)
  if (p === 'EN_PLAZO' || p === 'SIN_PLAZO') return null
  return `${que} queda ${p === 'ANTES' ? 'antes del inicio previsto' : 'después del límite'} (previsto: ${fmt(inicio)} → ${fmt(limite)}).`
}

export const MOTIVO_EXCEPCION_MINIMO = 20

/** Error de la justificación (si hace falta), para el validate del formulario. */
export function errorExcepcion(fuera: string | null, motivo: string): string | null {
  if (!fuera) return null
  return motivo.trim().length < MOTIVO_EXCEPCION_MINIMO ? `Justifique la excepción (mínimo ${MOTIVO_EXCEPCION_MINIMO} caracteres).` : null
}
