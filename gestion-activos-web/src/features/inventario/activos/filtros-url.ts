import type { FiltrosApiActivos } from '../api/activos.ts'

/** Activos por página en el listado. */
export const TAMANO_PAGINA = 20

/** Filtros del listado tal como viven en la URL (?q=...&page=2...). */
export interface FiltrosActivos {
  page: number
  q: string
  categoriaId?: number
  criticidadId?: number
  cifrado?: boolean
}

function enteroPositivo(valor: string | null): number | undefined {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** Lee los filtros de la URL; los valores inválidos se ignoran. */
export function leerFiltros(params: URLSearchParams): FiltrosActivos {
  const cifrado = params.get('cifrado')
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    q: params.get('q')?.trim() ?? '',
    categoriaId: enteroPositivo(params.get('categoriaId')),
    criticidadId: enteroPositivo(params.get('criticidadId')),
    cifrado: cifrado === 'true' ? true : cifrado === 'false' ? false : undefined,
  }
}

/** Escribe los filtros en la URL omitiendo los vacíos y los valores por defecto. */
export function escribirFiltros(filtros: FiltrosActivos): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.categoriaId) params.set('categoriaId', String(filtros.categoriaId))
  if (filtros.criticidadId) params.set('criticidadId', String(filtros.criticidadId))
  if (filtros.cifrado !== undefined) params.set('cifrado', String(filtros.cifrado))
  if (filtros.page > 1) params.set('page', String(filtros.page))
  return params
}

/** Traduce los filtros de la URL a los parámetros de GET /api/activos. */
export function aConsultaApi(filtros: FiltrosActivos): FiltrosApiActivos {
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    q: filtros.q || undefined,
    categoriaId: filtros.categoriaId,
    criticidadId: filtros.criticidadId,
    cifrado: filtros.cifrado,
  }
}
