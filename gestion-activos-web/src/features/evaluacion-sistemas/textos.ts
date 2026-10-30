import type { EstadoEvaluacion, SituacionEvaluacion } from './api.ts'

type Info = { etiqueta: string; color: string }

export const INFO_ESTADO: Record<EstadoEvaluacion, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'gray' },
}
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoEvaluacion[]

/** Días del tablero (como el de Planificación de Mantenimientos). */
export const DIAS_TABLERO = 60

/** Situación para la bitácora (la calcula el backend): pendiente o vencida sin cerrar; cumplida a tiempo o tarde. */
export const INFO_SITUACION: Record<SituacionEvaluacion, Info> = {
  PENDIENTE: { etiqueta: 'Pendiente', color: 'blue' },
  VENCIDA: { etiqueta: 'Vencida', color: 'red' },
  CUMPLIDA: { etiqueta: 'Cumplida', color: 'green' },
  CUMPLIDA_TARDE: { etiqueta: 'Cumplida tarde', color: 'orange' },
}
export const SITUACIONES = Object.keys(INFO_SITUACION) as SituacionEvaluacion[]
