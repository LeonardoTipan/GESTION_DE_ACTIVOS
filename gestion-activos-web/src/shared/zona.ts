import dayjs, { type Dayjs } from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Zona horaria de la institución: la misma que usa la API (ZONA_HORARIA o
 * GLPI_TIMEZONE, por defecto America/Guayaquil). Todas las fechas y horas se
 * muestran, se capturan y se comparan en esta zona, sea cual sea la del equipo.
 */
export const ZONA_HORARIA: string = import.meta.env.VITE_ZONA_HORARIA || 'America/Guayaquil'

/** Valor de un selector de fecha y hora de Mantine: hora de pared, sin zona. */
const HORA_DE_PARED = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/

/**
 * El instante que representa un valor: un ISO de la API (con zona) se toma tal
 * cual; un valor de formulario ("2026-10-16 14:30:00") se entiende en la hora
 * de la institución.
 */
export function instante(valor: string | Date | Dayjs): Dayjs {
  if (typeof valor === 'string' && HORA_DE_PARED.test(valor)) return dayjs.tz(valor, ZONA_HORARIA)
  return dayjs(valor)
}

/** Un instante (o ahora) en la hora de la institución: para mostrarlo o sacar su día y hora. */
export function enZona(valor?: string | Date | Dayjs | null): Dayjs {
  return (valor == null ? dayjs() : instante(valor)).tz(ZONA_HORARIA)
}
