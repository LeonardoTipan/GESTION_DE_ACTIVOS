const fechaCorta = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const fechaHora = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "2026-09-15T00:00:00.000Z" → "15 sept 2026" (la fecha, sin hora). */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Las fechas sin hora se guardan a medianoche UTC: se muestran en UTC para no "cambiar de día".
  return fechaCorta.format(new Date(iso)).replace('.', '')
}

/** Fecha y hora local: para registros de auditoría (bitácora). */
export function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fechaHora.format(new Date(iso))
}

/** "2026-09-15" (valor de un DateInput) → "2026-09-15T00:00:00.000Z" (formato de la API). */
export function diaAIso(dia: string): string {
  return `${dia}T00:00:00.000Z`
}

/** "2026-09-15T00:00:00.000Z" → "2026-09-15" (para precargar un DateInput). */
export function isoADia(iso: string): string {
  return iso.slice(0, 10)
}
