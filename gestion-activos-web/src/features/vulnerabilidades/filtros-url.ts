import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import type {
  EstadoVulnerabilidad,
  FiltrosApiVulnerabilidades,
  Fuente,
  NivelRiesgo,
  Prioridad,
} from './api/vulnerabilidades.ts'
import { ESTADOS, ESTADOS_CERRADOS, ESTADOS_PENDIENTES, FUENTES, NIVELES, PRIORIDADES } from './riesgo.ts'

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
  categoriaId?: number
  prioridad?: Prioridad
  fuente?: Fuente
  /** true: confirmadas · false: solo detectadas, sin confirmar. */
  confirmada?: boolean
  /** Búsqueda libre: CVE, descripción o activo. */
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
  const confirmada = params.get('confirmada')
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    vista,
    nivelRiesgo: valorPermitido(params.get('nivel'), NIVELES),
    // Un estado que no encaja con la vista (p. ej. MITIGADA en "pendientes") se ignora.
    estado: valorPermitido(params.get('estado'), estadosDeVista(vista)),
    activoId: enteroPositivo(params.get('activoId')),
    categoriaId: enteroPositivo(params.get('categoriaId')),
    prioridad: valorPermitido(params.get('prioridad'), PRIORIDADES),
    fuente: valorPermitido(params.get('fuente'), FUENTES),
    confirmada: confirmada === '1' ? true : confirmada === '0' ? false : undefined,
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
  if (filtros.categoriaId) params.set('categoriaId', String(filtros.categoriaId))
  if (filtros.prioridad) params.set('prioridad', filtros.prioridad)
  if (filtros.fuente) params.set('fuente', filtros.fuente)
  if (filtros.confirmada !== undefined) params.set('confirmada', filtros.confirmada ? '1' : '0')
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
    categoriaId: filtros.categoriaId,
    prioridad: filtros.prioridad,
    fuente: filtros.fuente,
    confirmada: filtros.confirmada,
    // El cuadro de búsqueda busca en CVE, descripción y activo.
    q: filtros.cve || undefined,
    vencidas: filtros.vencidas,
  }
}
