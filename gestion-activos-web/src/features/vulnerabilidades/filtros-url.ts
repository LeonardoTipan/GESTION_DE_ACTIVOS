import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type {
  EstadoVulnerabilidad,
  FiltrosApiVulnerabilidades,
  NivelRiesgo,
} from './api/vulnerabilidades.ts'
import { ESTADOS, ESTADOS_CERRADOS, ESTADOS_PENDIENTES, NIVELES } from './riesgo.ts'

export const TAMANO_PAGINA = 20

/** Pendientes (por defecto: lo que hay que atender), cerradas o todas. */
export type Vista = 'pendientes' | 'cerradas' | 'todas'
const VISTAS: Vista[] = ['pendientes', 'cerradas', 'todas']

export interface FiltrosVulnerabilidades {
  page: number
  vista: Vista
  nivelRiesgo?: NivelRiesgo
  estado?: EstadoVulnerabilidad
  activoId?: number
  cve: string
  /** Solo pendientes con el plazo (SLA) ya vencido. */
  vencidas?: boolean
}

/** Estados que tienen sentido en cada vista (para el filtro de estado). */
export function estadosDeVista(vista: Vista): EstadoVulnerabilidad[] {
  return vista === 'pendientes'
    ? ESTADOS_PENDIENTES
    : vista === 'cerradas'
      ? ESTADOS_CERRADOS
      : ESTADOS
}

export function leerFiltros(params: URLSearchParams): FiltrosVulnerabilidades {
  const vista = valorPermitido(params.get('vista'), VISTAS) ?? 'pendientes'
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    vista,
    nivelRiesgo: valorPermitido(params.get('nivel'), NIVELES),
    // Un estado que no encaja con la vista (p. ej. MITIGADA en "pendientes") se ignora.
    estado: valorPermitido(params.get('estado'), estadosDeVista(vista)),
    activoId: enteroPositivo(params.get('activoId')),
    cve: params.get('cve') ?? '',
    // "Vencidas" solo existe entre las pendientes.
    vencidas: vista !== 'cerradas' && params.get('vencidas') === '1' ? true : undefined,
  }
}

export function escribirFiltros(filtros: FiltrosVulnerabilidades): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.vista !== 'pendientes') params.set('vista', filtros.vista)
  if (filtros.nivelRiesgo) params.set('nivel', filtros.nivelRiesgo)
  if (filtros.estado) params.set('estado', filtros.estado)
  if (filtros.activoId) params.set('activoId', String(filtros.activoId))
  if (filtros.cve) params.set('cve', filtros.cve)
  if (filtros.vencidas) params.set('vencidas', '1')
  if (filtros.page > 1) params.set('page', String(filtros.page))
  return params
}

export function aConsultaApi(filtros: FiltrosVulnerabilidades): FiltrosApiVulnerabilidades {
  return {
    page: filtros.page,
    limit: TAMANO_PAGINA,
    abiertas:
      filtros.vista === 'pendientes' ? true : filtros.vista === 'cerradas' ? false : undefined,
    nivelRiesgo: filtros.nivelRiesgo,
    estado: filtros.estado,
    activoId: filtros.activoId,
    cve: filtros.cve || undefined,
    vencidas: filtros.vencidas,
  }
}
