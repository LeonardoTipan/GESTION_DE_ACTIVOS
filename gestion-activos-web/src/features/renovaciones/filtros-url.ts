import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type { EstadoRenovacion, FiltrosApiRenovaciones, TipoRenovacion, Vigencia } from './api.ts'
import { ESTADOS, TIPOS, VIGENCIAS } from './textos.ts'

export const TAMANO_PAGINA = 20

/** Las DOS fases del módulo, cada una en su pestaña. */
export const FASES = ['planificacion', 'ejecucion'] as const
export type Fase = (typeof FASES)[number]

const DIA = /^\d{4}-\d{2}-\d{2}$/

export interface FiltrosRenovaciones {
  page: number
  /** Pestaña; sin valor, Planificación. */
  fase?: Fase
  activoId?: number
  tipo?: TipoRenovacion
  estado?: EstadoRenovacion
  vigencia?: Vigencia
  responsable?: string
  /** Rango de la caducidad que rige hoy, en días AAAA-MM-DD. */
  caducaDesde?: string
  caducaHasta?: string
  q?: string
}

export function leerFiltros(params: URLSearchParams): FiltrosRenovaciones {
  const dia = (clave: string) => {
    const v = params.get(clave)
    return v && DIA.test(v) ? v : undefined
  }
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    fase: valorPermitido(params.get('fase'), FASES),
    activoId: enteroPositivo(params.get('activoId')),
    tipo: valorPermitido(params.get('tipo'), TIPOS),
    estado: valorPermitido(params.get('estado'), ESTADOS),
    vigencia: valorPermitido(params.get('vigencia'), VIGENCIAS),
    responsable: params.get('responsable')?.trim() || undefined,
    caducaDesde: dia('caducaDesde'),
    caducaHasta: dia('caducaHasta'),
    q: params.get('q')?.trim() || undefined,
  }
}

export function escribirFiltros(f: FiltrosRenovaciones): URLSearchParams {
  const params = new URLSearchParams()
  if (f.fase) params.set('fase', f.fase)
  if (f.activoId) params.set('activoId', String(f.activoId))
  if (f.tipo) params.set('tipo', f.tipo)
  if (f.estado) params.set('estado', f.estado)
  if (f.vigencia) params.set('vigencia', f.vigencia)
  if (f.responsable) params.set('responsable', f.responsable)
  if (f.caducaDesde) params.set('caducaDesde', f.caducaDesde)
  if (f.caducaHasta) params.set('caducaHasta', f.caducaHasta)
  if (f.q) params.set('q', f.q)
  if (f.page > 1) params.set('page', String(f.page))
  return params
}

/**
 * Planificación: todo el registro. Ejecución y cierre: por defecto lo pendiente
 * (abierto o en progreso); con un estado elegido, ese estado.
 */
export function aConsultaApi(f: FiltrosRenovaciones): FiltrosApiRenovaciones {
  const ejecucion = f.fase === 'ejecucion'
  return {
    page: f.page,
    limit: TAMANO_PAGINA,
    activoId: f.activoId,
    tipo: f.tipo,
    estado: f.estado,
    vigencia: f.vigencia,
    responsable: f.responsable,
    caducaDesde: f.caducaDesde,
    caducaHasta: f.caducaHasta,
    q: f.q,
    pendientes: ejecucion && !f.estado ? true : undefined,
  }
}
