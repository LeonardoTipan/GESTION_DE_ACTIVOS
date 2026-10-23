import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

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

export function useVulnerabilidad(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/vulnerabilidades/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/** Tras cualquier cambio se refrescan listados, detalle y trazas. */
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
    onSuccess: invalidar,
  })
}

/** Corrige los datos de detección con motivo (solo mientras está pendiente). */
export function useEditarVulnerabilidad() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['EditarVulnerabilidadDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

// ── Fase 2 · Remediación ────────────────────────────────────────────────────

/** ABIERTO → EN_PROGRESO. */
export function useIniciarRemediacion() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['IniciarRemediacionDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/iniciar', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

/** Guarda o corrige los datos de remediación sin cambiar el estado. */
export function useActualizarRemediacion() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['ActualizarRemediacionDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/remediacion', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

/** → REMEDIADO, con la fecha real, el verificable y el repositorio. */
export function useRemediar() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['RemediarDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/remediar', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

/** REMEDIADO → EN_PROGRESO, con motivo. */
export function useReabrir() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSuccess: invalidar,
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
    onSuccess: invalidar,
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
