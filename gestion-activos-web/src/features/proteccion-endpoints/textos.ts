import type { EstadoPeriodo } from './api.ts'

type Info = { etiqueta: string; color: string }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const INFO_ESTADO: Record<EstadoPeriodo, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'gray' },
}
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoPeriodo[]

export const nombrePeriodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`

export type PestanaEndpoints = 'planificacion' | 'ejecucion' | 'bitacora'

/** La pestaña de la URL; cualquier otro valor es la primera. */
export const pestanaDe = (v: string | null): PestanaEndpoints => (v === 'ejecucion' || v === 'bitacora' ? v : 'planificacion')

/** Nombres legibles de los campos, para el historial (trazas). */
export const ETIQUETAS_TRAZA: Record<string, string> = {
  anio: 'Año',
  mes: 'Mes',
  responsable: 'Responsable asignado',
  observacion: 'Observaciones',
  estado: 'Estado',
  totalActivos: 'Total de activos',
  equiposConAntivirus: 'Equipos con antivirus',
  fechaEjecucion: 'Fecha real de ejecución',
  responsableEjecucion: 'Responsable de la ejecución',
  evidencia: 'Evidencia verificable',
  repositorioVerificable: 'Repositorio verificable',
  cerradoPor: 'Cerrado por',
}

/**
 * Los datos para cerrar, si ya están guardados y son coherentes; si no, null. Solo decide si se
 * ofrece «Cerrar»: la validación definitiva (fechas y repositorio incluidos) es la del backend.
 */
export function resumenParaCerrar(p: {
  anio: number
  mes: number
  totalActivos: number | null
  equiposConAntivirus: number | null
  fechaEjecucion: string | null
  responsableEjecucion: string | null
  evidencia: string | null
  repositorioVerificable: string | null
}) {
  const { anio, mes, totalActivos, equiposConAntivirus, fechaEjecucion, responsableEjecucion, evidencia, repositorioVerificable } = p
  if (totalActivos === null || totalActivos < 1 || equiposConAntivirus === null || equiposConAntivirus > totalActivos) return null
  if (!fechaEjecucion || !responsableEjecucion?.trim() || !evidencia?.trim() || !repositorioVerificable?.trim()) return null
  return { anio, mes, totalActivos, equiposConAntivirus, fechaEjecucion, responsableEjecucion, evidencia, repositorioVerificable }
}

/**
 * Fecha del último cierre, según la auditoría (no hay columna propia). Las trazas llegan de la
 * más reciente a la más antigua. La usa quien ya sabe que el período está cerrado.
 */
export function ultimoCierre(trazas: { fecha: string; cambios: { campo: string; despues?: unknown }[] }[]): string | null {
  return trazas.find((t) => t.cambios.some((c) => c.campo === 'estado' && c.despues === 'CERRADO'))?.fecha ?? null
}

/** Situación de cada mes de un año en el calendario: su estado, «sin abrir» o futuro. */
export type SituacionMes = EstadoPeriodo | 'SIN_ABRIR' | 'FUTURO'

/**
 * Los 12 meses del año con su situación, a partir de los períodos REALES. «Hoy» (año y mes en
 * curso) lo da quien llama: un mes posterior es futuro (no se puede abrir).
 */
export function mesesDelAnio(
  periodos: { anio: number; mes: number; estado: EstadoPeriodo }[],
  anio: number,
  hoy: { anio: number; mes: number },
): { mes: number; situacion: SituacionMes }[] {
  const porMes = new Map(periodos.filter((p) => p.anio === anio).map((p) => [p.mes, p.estado]))
  return MESES.map((_, i) => {
    const mes = i + 1
    const estado = porMes.get(mes)
    if (estado) return { mes, situacion: estado }
    return { mes, situacion: anio * 12 + mes > hoy.anio * 12 + hoy.mes ? 'FUTURO' : 'SIN_ABRIR' }
  })
}

/** Meses ya transcurridos (incluido el actual) del año en curso que aún no tienen período. */
export const mesesSinAbrir = (meses: { situacion: SituacionMes }[]) => meses.filter((m) => m.situacion === 'SIN_ABRIR').length
