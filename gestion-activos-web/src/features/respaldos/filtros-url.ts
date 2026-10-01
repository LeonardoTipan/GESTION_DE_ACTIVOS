import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type { Etapa, FiltrosApiRespaldos } from './api/respaldos.ts'
import { ETAPAS } from './etapas.ts'

export const TAMANO_PAGINA = 20

export interface FiltrosRespaldos {
  page: number
  etapa?: Etapa
  activoId?: number
}

export function leerFiltros(params: URLSearchParams): FiltrosRespaldos {
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    etapa: valorPermitido(params.get('etapa'), ETAPAS),
    activoId: enteroPositivo(params.get('activoId')),
  }
}

export function escribirFiltros(filtros: FiltrosRespaldos): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.etapa) params.set('etapa', filtros.etapa)
  if (filtros.activoId) params.set('activoId', String(filtros.activoId))
  if (filtros.page > 1) params.set('page', String(filtros.page))
  return params
}

export function aConsultaApi(filtros: FiltrosRespaldos): FiltrosApiRespaldos {
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    etapa: filtros.etapa,
    activoId: filtros.activoId,
  }
}
