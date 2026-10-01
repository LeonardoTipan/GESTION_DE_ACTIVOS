import type {
  EstadoEquipo,
  Fase,
  Mantenimiento,
  TipoMantenimiento,
} from './api/mantenimientos.ts'

type Info = { etiqueta: string; color: string }

export const INFO_FASE: Record<Fase, Info> = {
  PROGRAMADO: { etiqueta: 'Programado', color: 'blue' },
  EN_EJECUCION: { etiqueta: 'En ejecución', color: 'yellow' },
  FINALIZADO: { etiqueta: 'Finalizado', color: 'green' },
  CANCELADO: { etiqueta: 'Cancelado', color: 'gray' },
}

export const INFO_TIPO: Record<TipoMantenimiento, Info> = {
  PREVENTIVO: { etiqueta: 'Preventivo', color: 'teal' },
  CORRECTIVO: { etiqueta: 'Correctivo', color: 'orange' },
}

export const INFO_ESTADO_EQUIPO: Record<EstadoEquipo, Info> = {
  OPERATIVO: { etiqueta: 'Operativo', color: 'green' },
  DEGRADADO: { etiqueta: 'Degradado', color: 'orange' },
  FUERA_DE_SERVICIO: { etiqueta: 'Fuera de servicio', color: 'red' },
}

export const FASES = Object.keys(INFO_FASE) as Fase[]
export const TIPOS = Object.keys(INFO_TIPO) as TipoMantenimiento[]
export const ESTADOS_EQUIPO = Object.keys(INFO_ESTADO_EQUIPO) as EstadoEquipo[]

export type Accion = 'iniciar' | 'finalizar' | 'cancelar'

/** Transiciones que permite cada fase (las mismas que valida la API). */
export function accionesPermitidas(fase: Fase): Accion[] {
  switch (fase) {
    case 'PROGRAMADO':
      return ['iniciar', 'cancelar']
    case 'EN_EJECUCION':
      return ['finalizar', 'cancelar']
    default:
      return []
  }
}

export type EstadoPaso = 'completado' | 'cancelado' | 'pendiente'

/**
 * Estado de los 3 pasos del Stepper: programado, en ejecución y finalizado.
 * Si se canceló, el primer paso no alcanzado queda marcado como cancelado.
 */
export function estadoPasos(
  m: Pick<Mantenimiento, 'fase' | 'fechaInicio'>,
): [EstadoPaso, EstadoPaso, EstadoPaso] {
  switch (m.fase) {
    case 'PROGRAMADO':
      return ['completado', 'pendiente', 'pendiente']
    case 'EN_EJECUCION':
      return ['completado', 'completado', 'pendiente']
    case 'FINALIZADO':
      return ['completado', 'completado', 'completado']
    case 'CANCELADO':
      // Con fechaInicio se canceló durante la ejecución; sin ella, antes de empezar.
      return m.fechaInicio
        ? ['completado', 'completado', 'cancelado']
        : ['completado', 'cancelado', 'pendiente']
  }
}

/** Paso "activo" del Stepper: el primero que no está completado (3 = todos). */
export function pasoActivo(pasos: readonly EstadoPaso[]): number {
  const i = pasos.findIndex((p) => p !== 'completado')
  return i === -1 ? pasos.length : i
}
