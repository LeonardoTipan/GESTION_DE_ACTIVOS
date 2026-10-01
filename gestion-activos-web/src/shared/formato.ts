import dayjs from 'dayjs'

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

/** Formato de los valores de DateTimePicker de Mantine (hora LOCAL del usuario). */
export const FORMATO_FECHA_HORA_LOCAL = 'YYYY-MM-DD HH:mm:ss'

/** "2026-10-01 14:30:00" (hora local) → ISO en UTC para la API. */
export function fechaHoraLocalAIso(valor: string): string {
  // El núcleo de dayjs interpreta "AAAA-MM-DD HH:mm:ss" como hora local.
  return dayjs(valor).toISOString()
}

/** ISO de la API → "2026-10-01 14:30:00" en hora local (para un DateTimePicker). */
export function isoAFechaHoraLocal(iso: string): string {
  return dayjs(iso).format(FORMATO_FECHA_HORA_LOCAL)
}

/** Ahora, en el formato del DateTimePicker (valor inicial de los formularios). */
export function ahoraLocal(): string {
  return dayjs().format(FORMATO_FECHA_HORA_LOCAL)
}
