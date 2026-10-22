import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type {
  Fase,
  FiltrosApiMantenimientos,
  TipoMantenimiento,
} from './api/mantenimientos.ts'
import { FASES, TIPOS } from './fases.ts'

export const TAMANO_PAGINA = 20

/** Las DOS fases del módulo (planificación y ejecución) y las bitácoras, cada una en su pestaña. */
export const CAPAS = ['planificacion', 'ejecucion', 'bitacoras'] as const
export type Capa = (typeof CAPAS)[number]

export interface FiltrosMantenimientos {
  page: number
  /** Pestaña; sin valor, la de ejecución. */
  capa?: Capa
  fase?: Fase
  tipo?: TipoMantenimiento
  activoId?: number
  /** Intervenciones de un plan. */
  planId?: number
  categoriaId?: number
  /** Búsqueda libre: activo, actividad, técnico… */
  q?: string
  tecnico?: string
  /** Solo PROGRAMADOS con fecha ya pasada. */
  vencidos?: boolean
}

export function leerFiltros(params: URLSearchParams): FiltrosMantenimientos {
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    capa: valorPermitido(params.get('capa'), CAPAS),
    fase: valorPermitido(params.get('fase'), FASES),
    tipo: valorPermitido(params.get('tipo'), TIPOS),
    activoId: enteroPositivo(params.get('activoId')),
    planId: enteroPositivo(params.get('planId')),
    categoriaId: enteroPositivo(params.get('categoriaId')),
    q: params.get('q')?.trim() || undefined,
    tecnico: params.get('tecnico')?.trim() || undefined,
    vencidos: params.get('vencidos') === '1' ? true : undefined,
  }
}

export function escribirFiltros(filtros: FiltrosMantenimientos): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.capa) params.set('capa', filtros.capa)
  if (filtros.fase) params.set('fase', filtros.fase)
  if (filtros.tipo) params.set('tipo', filtros.tipo)
  if (filtros.activoId) params.set('activoId', String(filtros.activoId))
  if (filtros.planId) params.set('planId', String(filtros.planId))
  if (filtros.categoriaId) params.set('categoriaId', String(filtros.categoriaId))
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.tecnico) params.set('tecnico', filtros.tecnico)
  if (filtros.vencidos) params.set('vencidos', '1')
  if (filtros.page > 1) params.set('page', String(filtros.page))
  return params
}

export function aConsultaApi(filtros: FiltrosMantenimientos): FiltrosApiMantenimientos {
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    order: 'desc',
    fase: filtros.fase,
    tipo: filtros.tipo,
    activoId: filtros.activoId,
    planId: filtros.planId,
    categoriaId: filtros.categoriaId,
    q: filtros.q,
    tecnico: filtros.tecnico,
    vencidos: filtros.vencidos,
  }
}
