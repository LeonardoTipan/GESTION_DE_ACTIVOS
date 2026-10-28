import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'
import { clasificarPendientes } from '../riesgo.ts'

export type Vulnerabilidad = components['schemas']['VulnerabilidadDto']
export type NivelRiesgo = Vulnerabilidad['nivelRiesgo']
export type EstadoVulnerabilidad = Vulnerabilidad['estado']
export type FiltrosApiVulnerabilidades = NonNullable<
  paths['/api/vulnerabilidades']['get']['parameters']['query']
>

const claves = {
  todo: ['vulnerabilidades'] as const,
  lista: (filtros: FiltrosApiVulnerabilidades) => ['vulnerabilidades', 'lista', filtros] as const,
  detalle: (id: number) => ['vulnerabilidades', 'detalle', id] as const,
}

/** La API ya las devuelve por urgencia: mayor criticidad primero y, dentro del nivel, la más antigua. */
export function useVulnerabilidades(filtros: FiltrosApiVulnerabilidades) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/vulnerabilidades', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

/** Páginas de 100 (el máximo de la API) que se leen como mucho para el tablero. */
const PAGINAS_TABLERO = 10

/**
 * Todas las pendientes de remediar (abiertas o en progreso, sin anuladas), para el tablero
 * de Detección. Recorre las páginas del listado existente; si hubiera más de
 * PAGINAS_TABLERO × 100, lo indica con `truncado` (las cifras serían parciales).
 */
export function usePendientesDeRemediar() {
  return useQuery({
    queryKey: [...claves.todo, 'tablero', 'pendientes'],
    queryFn: async () => {
      const filas: Vulnerabilidad[] = []
      let total = 0
      for (let page = 1; page <= PAGINAS_TABLERO; page++) {
        const r = await ejecutar(
          api.GET('/api/vulnerabilidades', { params: { query: { abiertas: true, incluirAnulados: false, page, limit: 100 } } }),
        )
        filas.push(...r.data)
        total = r.meta.total
        if (page >= r.meta.totalPages) break
      }
      return { ...clasificarPendientes(filas, Date.now()), leidas: filas.length, total, truncado: filas.length < total }
    },
  })
}

export function useVulnerabilidad(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/vulnerabilidades/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/**
 * Tras cualquier operación se refrescan listados, detalle y trazas; se usa en onSettled:
 * también tras un error (p. ej. 409 porque el registro cambió en otra pestaña), para que la
 * ficha y la tabla muestren lo que confirma el servidor y no un estado antiguo.
 */
function useInvalidarVulnerabilidades() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: claves.todo })
    void queryClient.invalidateQueries({ queryKey: ['trazas'] })
  }
}

// ── Fase 1 · Detección ──────────────────────────────────────────────────────

/** La misma vulnerabilidad en uno o varios activos: una por activo (todas o ninguna), en ABIERTO. */
export function useRegistrarLote() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: (datos: components['schemas']['RegistrarLoteDto']) =>
      ejecutar(api.POST('/api/vulnerabilidades/lote', { body: datos })),
    onSettled: invalidar,
  })
}

/** Corrige los datos de detección con motivo (solo mientras está pendiente). */
export function useEditarVulnerabilidad() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['EditarVulnerabilidadDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

// ── Fase 2 · Remediación ────────────────────────────────────────────────────

/** ABIERTO → EN_PROGRESO. */
export function useIniciarRemediacion() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['IniciarRemediacionDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/iniciar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** Guarda o corrige los datos de remediación sin cambiar el estado. */
export function useActualizarRemediacion() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['ActualizarRemediacionDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/remediacion', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** → REMEDIADO, con la fecha real, el verificable y el repositorio. */
export function useRemediar() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['RemediarDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/remediar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** REMEDIADO → EN_PROGRESO, con motivo. */
export function useReabrir() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSettled: invalidar,
  })
}

// ── Registro ────────────────────────────────────────────────────────────────

/**
 * Anular (eliminación lógica) o revertir la anulación. Solo admin. Nada se
 * borra: el registro queda marcado y deja de contar en los indicadores.
 */
export function useAnulacionVulnerabilidad() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, modo, motivo }: { id: number; modo: 'anular' | 'reversar'; motivo: string }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/vulnerabilidades/{id}/anular', opciones))
        : ejecutar(api.POST('/api/vulnerabilidades/{id}/reversar', opciones))
    },
    onSettled: invalidar,
  })
}

/** Indicadores del período (los anulados no cuentan). */
export function useIndicadoresVulnerabilidad(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...claves.todo, 'indicadores', desde, hasta],
    queryFn: () =>
      ejecutar(api.GET('/api/vulnerabilidades/indicadores', { params: { query: { desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}
