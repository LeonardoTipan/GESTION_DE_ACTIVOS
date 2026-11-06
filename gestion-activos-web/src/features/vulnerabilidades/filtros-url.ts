import { fechaHoraLocalAIso } from '../../shared/formato.ts'
import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type { EstadoVulnerabilidad, FiltrosApiVulnerabilidades, FiltrosBitacoraVulnerabilidades, NivelRiesgo } from './api/vulnerabilidades.ts'
import { ESTADOS, NIVELES } from './riesgo.ts'

export const TAMANO_PAGINA = 20

/** Las DOS fases del módulo, cada una en su pestaña, y la Bitácora (consulta). */
export const FASES = ['deteccion', 'remediacion', 'bitacora'] as const
export type Fase = (typeof FASES)[number]

/** Vista de la pestaña Remediación; sin valor, las pendientes (abiertas y en progreso). */
export const VISTAS = ['remediadas', 'todas'] as const
export type Vista = (typeof VISTAS)[number]

const DIA = /^\d{4}-\d{2}-\d{2}$/

export interface FiltrosVulnerabilidades {
  page: number
  /** Pestaña; sin valor, Detección. */
  fase?: Fase
  /** Remediación: pendientes (sin valor), remediadas o todas. */
  vista?: Vista
  /** Bitácora: año (sin valor, el actual) y trimestre (sin valor, el año entero). */
  anio?: number
  trimestre?: number
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
    vista: valorPermitido(params.get('vista'), VISTAS),
    anio: enteroPositivo(params.get('anio')),
    trimestre: valorPermitido(params.get('trimestre'), ['1', '2', '3', '4'] as const) ? Number(params.get('trimestre')) : undefined,
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
  if (filtros.vista) params.set('vista', filtros.vista)
  if (filtros.anio) params.set('anio', String(filtros.anio))
  if (filtros.trimestre) params.set('trimestre', String(filtros.trimestre))
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
 * Detección: todo el registro (la matriz), con el estado elegido. Remediación: según la vista,
 * lo pendiente (ABIERTO y EN_PROGRESO, por defecto), lo remediado o todo.
 */
export function aConsultaApi(filtros: FiltrosVulnerabilidades): FiltrosApiVulnerabilidades {
  const remediacion = filtros.fase === 'remediacion'
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    nivelRiesgo: filtros.nivelRiesgo,
    estado: remediacion ? (filtros.vista === 'remediadas' ? 'REMEDIADO' : undefined) : filtros.estado,
    abiertas: remediacion && !filtros.vista ? true : undefined,
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

/** Bitácora Específica: los mismos filtros de búsqueda y el período del indicador (sin anuladas). */
export function aConsultaBitacora(filtros: FiltrosVulnerabilidades, anioActual: number): FiltrosBitacoraVulnerabilidades {
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    anio: filtros.anio ?? anioActual,
    trimestre: filtros.trimestre,
    estado: filtros.estado,
    nivelRiesgo: filtros.nivelRiesgo,
    categoriaId: filtros.categoriaId,
    responsable: filtros.responsable,
    q: filtros.q,
  }
}
