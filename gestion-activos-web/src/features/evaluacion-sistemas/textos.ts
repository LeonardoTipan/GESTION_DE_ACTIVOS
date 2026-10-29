import type { EstadoEvaluacion } from './api.ts'

type Info = { etiqueta: string; color: string }

export const INFO_ESTADO: Record<EstadoEvaluacion, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'gray' },
}
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoEvaluacion[]

/** Días del tablero (como el de Planificación de Mantenimientos). */
export const DIAS_TABLERO = 60
