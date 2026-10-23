import { fechaHoraLocalAIso } from '../../shared/formato.ts'
import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type { EstadoVulnerabilidad, FiltrosApiVulnerabilidades, NivelRiesgo } from './api/vulnerabilidades.ts'
import { ESTADOS, NIVELES } from './riesgo.ts'

export const TAMANO_PAGINA = 20

/** Las DOS fases del módulo, cada una en su pestaña. */
export const FASES = ['deteccion', 'remediacion'] as const
export type Fase = (typeof FASES)[number]

const DIA = /^\d{4}-\d{2}-\d{2}$/

export interface FiltrosVulnerabilidades {
  page: number
  /** Pestaña; sin valor, Detección. */
  fase?: Fase
  nivelRiesgo?: NivelRiesgo
  estado?: EstadoVulnerabilidad
  activoId?: number
  categoriaId?: number
  responsable?: string
  /** Rango de la fecha de detección, en días AAAA-MM-DD (hora de la institución). */
  desde?: string
  hasta?: string
  /** Búsqueda libre: CVE, descripción o activo. */
  q?: string
  /** Solo pendientes con el plazo ya vencido. */
  vencidas?: boolean
}

export function leerFiltros(params: URLSearchParams): FiltrosVulnerabilidades {
  const dia = (clave: string) => {
    const v = params.get(clave)
    return v && DIA.test(v) ? v : undefined
  }
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    fase: valorPermitido(params.get('fase'), FASES),
    nivelRiesgo: valorPermitido(params.get('nivel'), NIVELES),
    estado: valorPermitido(params.get('estado'), ESTADOS),
    activoId: enteroPositivo(params.get('activoId')),
    categoriaId: enteroPositivo(params.get('categoriaId')),
    responsable: params.get('responsable')?.trim() || undefined,
    desde: dia('desde'),
    hasta: dia('hasta'),
    q: params.get('q')?.trim() || undefined,
    vencidas: params.get('vencidas') === '1' ? true : undefined,
  }
}

export function escribirFiltros(filtros: FiltrosVulnerabilidades): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.fase) params.set('fase', filtros.fase)
  if (filtros.nivelRiesgo) params.set('nivel', filtros.nivelRiesgo)
  if (filtros.estado) params.set('estado', filtros.estado)
  if (filtros.activoId) params.set('activoId', String(filtros.activoId))
  if (filtros.categoriaId) params.set('categoriaId', String(filtros.categoriaId))
  if (filtros.responsable) params.set('responsable', filtros.responsable)
  if (filtros.desde) params.set('desde', filtros.desde)
  if (filtros.hasta) params.set('hasta', filtros.hasta)
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.vencidas) params.set('vencidas', '1')
  if (filtros.page > 1) params.set('page', String(filtros.page))
  return params
}

/**
 * Detección: todo el registro (la matriz). Remediación: por defecto lo pendiente
 * (ABIERTO y EN_PROGRESO); con un estado elegido, ese estado.
 */
export function aConsultaApi(filtros: FiltrosVulnerabilidades): FiltrosApiVulnerabilidades {
  const remediacion = filtros.fase === 'remediacion'
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    nivelRiesgo: filtros.nivelRiesgo,
    estado: filtros.estado,
    abiertas: remediacion && !filtros.estado ? true : undefined,
    activoId: filtros.activoId,
    categoriaId: filtros.categoriaId,
    responsable: filtros.responsable,
    // Días completos en la hora de la institución.
    desde: filtros.desde ? fechaHoraLocalAIso(`${filtros.desde} 00:00:00`) : undefined,
    hasta: filtros.hasta ? fechaHoraLocalAIso(`${filtros.hasta} 23:59:59`) : undefined,
    q: filtros.q,
    vencidas: filtros.vencidas,
  }
}
