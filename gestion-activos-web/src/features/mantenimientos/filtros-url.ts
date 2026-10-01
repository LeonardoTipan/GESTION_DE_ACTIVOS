import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type {
  Fase,
  FiltrosApiMantenimientos,
  TipoMantenimiento,
} from './api/mantenimientos.ts'
import { FASES, TIPOS } from './fases.ts'

export const TAMANO_PAGINA = 20

export interface FiltrosMantenimientos {
  page: number
  fase?: Fase
  tipo?: TipoMantenimiento
  activoId?: number
  /** Solo PROGRAMADOS con fecha ya pasada. */
  vencidos?: boolean
}

export function leerFiltros(params: URLSearchParams): FiltrosMantenimientos {
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    fase: valorPermitido(params.get('fase'), FASES),
    tipo: valorPermitido(params.get('tipo'), TIPOS),
    activoId: enteroPositivo(params.get('activoId')),
    vencidos: params.get('vencidos') === '1' ? true : undefined,
  }
}

export function escribirFiltros(filtros: FiltrosMantenimientos): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.fase) params.set('fase', filtros.fase)
  if (filtros.tipo) params.set('tipo', filtros.tipo)
  if (filtros.activoId) params.set('activoId', String(filtros.activoId))
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
    vencidos: filtros.vencidos,
  }
}
