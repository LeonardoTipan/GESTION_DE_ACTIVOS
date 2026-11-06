import { isoAFechaHoraLocal } from '../../shared/formato.ts'
import { periodoDeFecha } from '../../shared/periodo.ts'
import type { EstadoEvaluacion, EvaluacionSistema, SituacionEvaluacion } from './api.ts'

export type PestanaEvaluacion = 'planificacion' | 'ejecucion' | 'bitacora'

/** La pestaña de la URL; cualquier otro valor es la primera. */
export const pestanaDe = (v: string | null): PestanaEvaluacion => (v === 'ejecucion' || v === 'bitacora' ? v : 'planificacion')

/** Mínimo de la justificación de unas pruebas tardías (la regla del backend). */
export const JUSTIFICACION_MINIMA = 20

/** Nombres legibles de los campos, para el historial (trazas). */
export const ETIQUETAS_TRAZA: Record<string, string> = {
  activoId: 'Sistema (activo)',
  fechaProgramadaProduccion: 'Fecha planificada de evaluación',
  responsable: 'Responsable asignado',
  descripcion: 'Descripción',
  estado: 'Estado',
  fechaPruebas: 'Fecha real de las pruebas',
  responsableEjecucion: 'Responsable de la ejecución',
  evidencia: 'Verificable (informe de seguridad)',
  repositorioVerificable: 'Repositorio verificable',
  observacion: 'Observaciones',
  cerradoPor: 'Cerrada por',
}

/** Mes y semestre de la fecha planificada (calculados en la hora de la institución). */
export function periodoPlanificado(e: Pick<EvaluacionSistema, 'fechaProgramadaProduccion'>): string {
  const p = periodoDeFecha(isoAFechaHoraLocal(e.fechaProgramadaProduccion))
  return p ? `${p.nombreMes} ${p.anio} · ${p.semestre}` : '—'
}

/**
 * Lo que se cerrará, si ya está guardado todo lo obligatorio (fecha real, responsable de la
 * ejecución, informe, repositorio y, si fue tardía, la justificación); si no, null. Solo decide si
 * se ofrece «Cerrar»: la validación definitiva es la del backend.
 */
export function resumenParaCerrarEvaluacion(e: Pick<EvaluacionSistema, 'activo' | 'fechaPruebas' | 'responsableEjecucion' | 'evidencia' | 'repositorioVerificable' | 'tardia' | 'observacion'>) {
  if (!e.fechaPruebas || !e.responsableEjecucion?.trim() || !e.evidencia?.trim() || !e.repositorioVerificable?.trim()) return null
  if (e.tardia && (e.observacion?.trim().length ?? 0) < JUSTIFICACION_MINIMA) return null
  return {
    codigo: e.activo.codigo,
    fechaPruebas: e.fechaPruebas,
    responsableEjecucion: e.responsableEjecucion,
    evidencia: e.evidencia,
    repositorioVerificable: e.repositorioVerificable,
    tardia: e.tardia,
  }
}

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
