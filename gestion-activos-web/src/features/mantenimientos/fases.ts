import type {
  Cierre,
  EstadoEquipo,
  Fase,
  FrecuenciaMantenimiento,
  Mantenimiento,
  ResultadoVerificacion,
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

export const INFO_FRECUENCIA: Record<FrecuenciaMantenimiento, string> = {
  UNICA: 'Única vez',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
}

/** Capa 3: en qué punto del cierre está un mantenimiento. */
export const INFO_CIERRE: Record<Cierre, Info> = {
  NO_APLICA: { etiqueta: '—', color: 'gray' },
  PENDIENTE_VERIFICACION: { etiqueta: 'Pendiente de verificar', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado · operativo', color: 'green' },
  EN_SEGUIMIENTO: { etiqueta: 'Requiere seguimiento', color: 'orange' },
  NO_SATISFACTORIO: { etiqueta: 'No satisfactorio', color: 'red' },
}

export const INFO_RESULTADO_VERIFICACION: Record<ResultadoVerificacion, Info> = {
  OPERATIVO: { etiqueta: 'Operativo', color: 'green' },
  REQUIERE_SEGUIMIENTO: { etiqueta: 'Requiere seguimiento', color: 'orange' },
  NO_SATISFACTORIO: { etiqueta: 'No satisfactorio', color: 'red' },
}

export const FRECUENCIAS = Object.keys(INFO_FRECUENCIA) as FrecuenciaMantenimiento[]
export const RESULTADOS_VERIFICACION = Object.keys(INFO_RESULTADO_VERIFICACION) as ResultadoVerificacion[]
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

/** Lo que la API exige para cerrar como OPERATIVO y aún falta (para avisar antes de enviar). */
export function faltantesParaCerrar(m: Pick<Mantenimiento, 'tecnico' | 'diagnostico' | 'duracionMin' | 'resultado'>): string[] {
  return [
    !m.tecnico && 'técnico',
    !m.diagnostico && 'diagnóstico',
    m.duracionMin === null && 'duración',
    !m.resultado && 'actividades realizadas',
  ].filter((x): x is string => Boolean(x))
}
