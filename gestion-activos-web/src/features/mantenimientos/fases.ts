import type {
  Cierre,
  ClaseMantenimiento,
  EstadoEquipo,
  Fase,
  FrecuenciaMantenimiento,
  Mantenimiento,
  ResultadoVerificacion,
  TipoMantenimiento,
} from './api/mantenimientos.ts'

type Info = { etiqueta: string; color: string }

/** SITUACIÓN de la ejecución (distinta de la condición del equipo). */
export const INFO_FASE: Record<Fase, Info> = {
  PROGRAMADO: { etiqueta: 'Pendiente', color: 'blue' },
  EN_EJECUCION: { etiqueta: 'En ejecución', color: 'yellow' },
  FINALIZADO: { etiqueta: 'Completado', color: 'green' },
  CANCELADO: { etiqueta: 'Cancelado', color: 'gray' },
}

export const INFO_TIPO: Record<TipoMantenimiento, Info> = {
  PREVENTIVO: { etiqueta: 'Preventivo', color: 'teal' },
  CORRECTIVO: { etiqueta: 'Correctivo', color: 'orange' },
  PREDICTIVO: { etiqueta: 'Predictivo', color: 'indigo' },
  PERFECTIVO: { etiqueta: 'Perfectivo', color: 'cyan' },
  ADAPTATIVO: { etiqueta: 'Adaptativo', color: 'grape' },
  EVOLUTIVO: { etiqueta: 'Evolutivo', color: 'violet' },
}

export const INFO_CLASE: Record<ClaseMantenimiento, string> = {
  HARDWARE: 'Hardware',
  SOFTWARE: 'Software',
}

/** Tipos válidos según la clase de la categoría del activo (la API aplica la misma regla). */
export function tiposPermitidos(clase: ClaseMantenimiento | null | undefined): TipoMantenimiento[] {
  if (clase === 'HARDWARE') return ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO']
  if (clase === 'SOFTWARE') return ['PREVENTIVO', 'CORRECTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO']
  return ['PREVENTIVO', 'CORRECTIVO']
}

/** Tipos que valen para TODAS las clases dadas (varios activos a la vez). */
export function tiposComunes(clases: readonly (ClaseMantenimiento | null | undefined)[]): TipoMantenimiento[] {
  if (clases.length === 0) return TIPOS
  return clases.map(tiposPermitidos).reduce((a, b) => a.filter((t) => b.includes(t)))
}

/** Semestre (S1 ene–jun, S2 jul–dic) de un día AAAA-MM-DD ya en hora de Guayaquil. */
export function etiquetaSemestre(diaLocal: string): string {
  const [anio, mes] = diaLocal.split('-').map(Number)
  return `S${mes <= 6 ? 1 : 2}-${anio}`
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

/**
 * Repositorio del verificable: una carpeta o ruta (sin esquema, también C:\…) o una
 * URL http(s). Misma regla que la API; null = válido.
 */
export function errorRepositorio(valor: string): string | null {
  const v = valor.trim()
  if (v.length > 191) return 'Máximo 191 caracteres'
  if (!v || !/^[a-z][a-z0-9+.-]+:/i.test(v)) return null
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Solo URL http o https, o una carpeta compartida'
  } catch {
    return 'No es una URL válida'
  }
}
