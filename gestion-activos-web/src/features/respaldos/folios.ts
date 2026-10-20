import { enZona } from '../../shared/zona.ts'

// Funciones puras del módulo de respaldos (sin dependencias de la interfaz).

/** Folio legible del prototipo: PLN-0003, RES-0012, RST-0002. */
export const folio = (prefijo: 'PLN' | 'RES' | 'RST', id: number) =>
  `${prefijo}-${String(id).padStart(4, '0')}`

/** Fecha sugerida al pulsar una ventana: hoy, acotado a la ventana. */
export function fechaDeVentana(w: { ini: string; fin: string }, hoy: string): string {
  if (hoy < w.ini) return w.ini
  if (hoy > w.fin) return w.fin
  return hoy
}

type Ventana = 'NOCTURNA_22_02' | 'NOCTURNA_00_04' | 'FIN_DE_SEMANA' | 'HORARIO_LABORAL' | 'CONTINUA'

/**
 * ¿La hora real cae en la ventana horaria del plan? La misma regla que la API
 * (en la hora de la institución, sea cual sea la del equipo); solo sirve para
 * avisar antes de enviar: quien decide es la API.
 */
export function dentroDeVentana(ventana: Ventana, fecha: string | Date): boolean {
  const local = enZona(fecha)
  const dia = local.day()
  const minutos = local.hour() * 60 + local.minute()
  switch (ventana) {
    case 'NOCTURNA_22_02':
      return minutos >= 22 * 60 || minutos < 2 * 60
    case 'NOCTURNA_00_04':
      return minutos < 4 * 60
    case 'FIN_DE_SEMANA':
      return dia === 0 || dia === 6
    case 'HORARIO_LABORAL':
      return dia >= 1 && dia <= 5 && minutos >= 8 * 60 && minutos < 18 * 60
    case 'CONTINUA':
      return true
  }
}

/** Hora sugerida (HH:mm) dentro de la ventana, al registrar desde el calendario. */
export const HORA_SUGERIDA: Record<Ventana, string> = {
  NOCTURNA_22_02: '22:30',
  NOCTURNA_00_04: '01:00',
  FIN_DE_SEMANA: '10:00',
  HORARIO_LABORAL: '09:00',
  CONTINUA: '09:00',
}
