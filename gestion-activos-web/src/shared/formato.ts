import { enZona, instante, ZONA_HORARIA } from './zona.ts'

/** Cómo se muestra, en toda la aplicación, un dato opcional que no se ha registrado. */
export const SIN_DATO = 'No registrado'

const fechaCorta = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const diaEnZona = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: ZONA_HORARIA,
})

const fechaHora = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONA_HORARIA,
})

/**
 * Un día de calendario sin hora (compra, última revisión, inicio de un plan):
 * "2026-09-15T00:00:00.000Z" → "15 sept 2026".
 */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Se guardan a medianoche UTC: se muestran en UTC para no "cambiar de día".
  return fechaCorta.format(new Date(iso)).replace('.', '')
}

/** El día de un instante (una ejecución, un registro), en la hora de la institución. */
export function formatearDia(iso: string | null | undefined): string {
  if (!iso) return '—'
  return diaEnZona.format(new Date(iso)).replace('.', '')
}

/** Fecha y hora en la hora de la institución. */
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

/** Formato de los valores de DateTimePicker de Mantine (hora de la institución, sin zona). */
export const FORMATO_FECHA_HORA_LOCAL = 'YYYY-MM-DD HH:mm:ss'

/** "2026-10-01 14:30:00" (hora de la institución) → ISO en UTC para la API. */
export function fechaHoraLocalAIso(valor: string): string {
  return instante(valor).toISOString()
}

/** ISO de la API → "2026-10-01 14:30:00" en la hora de la institución (para un DateTimePicker). */
export function isoAFechaHoraLocal(iso: string): string {
  return enZona(iso).format(FORMATO_FECHA_HORA_LOCAL)
}

/** Ahora, en la hora de la institución y en el formato del DateTimePicker. */
export function ahoraLocal(): string {
  return enZona().format(FORMATO_FECHA_HORA_LOCAL)
}

/** Hoy, en la hora de la institución ("2026-10-16"). */
export function hoyLocal(): string {
  return enZona().format('YYYY-MM-DD')
}
