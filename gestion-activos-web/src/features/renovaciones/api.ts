import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type Renovacion = components['schemas']['RenovacionDto']
export type TipoRenovacion = Renovacion['tipo']
export type EstadoRenovacion = Renovacion['estado']
export type Vigencia = Renovacion['vigencia']
export type FiltrosApiRenovaciones = NonNullable<paths['/api/renovaciones']['get']['parameters']['query']>

const claves = {
  todo: ['renovaciones'] as const,
  lista: (f: FiltrosApiRenovaciones) => ['renovaciones', 'lista', f] as const,
  detalle: (id: number) => ['renovaciones', 'detalle', id] as const,
}

export function useRenovaciones(filtros: FiltrosApiRenovaciones) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/renovaciones', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useRenovacion(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/renovaciones/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/** Vigentes, próximas a caducar, caducadas y sin caducidad, con el umbral configurado. */
export function useResumenVigencias() {
  return useQuery({
    queryKey: [...claves.todo, 'resumen'],
    queryFn: () => ejecutar(api.GET('/api/renovaciones/resumen')),
  })
}

/** Lo caducado y lo que caduca pronto, por urgencia. */
export function useCaducidades() {
  return useQuery({
    queryKey: [...claves.todo, 'caducidades'],
    queryFn: () => ejecutar(api.GET('/api/renovaciones/caducidades')),
  })
}

/**
 * Tras cualquier operación se refrescan listados, resumen, detalle y trazas; se usa en
 * onSettled: también tras un error (p. ej. 409 porque el registro cambió en otra pestaña),
 * para que la ficha y la tabla muestren lo que confirma el servidor y no un estado antiguo.
 */
function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: claves.todo })
    void queryClient.invalidateQueries({ queryKey: ['trazas'] })
  }
}

// ── Fase 1 · Planificación ──────────────────────────────────────────────────

export function usePlanificar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: components['schemas']['CrearRenovacionDto']) => ejecutar(api.POST('/api/renovaciones', { body: datos })),
    onSettled: invalidar,
  })
}

export function useEditarPlanificacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['EditarPlanificacionDto'] }) =>
      ejecutar(api.PATCH('/api/renovaciones/{id}', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

// ── Fase 2 · Ejecución y cierre ─────────────────────────────────────────────

export function useIniciar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => ejecutar(api.PATCH('/api/renovaciones/{id}/iniciar', { params: { path: { id } } })),
    onSettled: invalidar,
  })
}

export function useGuardarEjecucion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['ActualizarEjecucionDto'] }) =>
      ejecutar(api.PATCH('/api/renovaciones/{id}/ejecucion', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

export function useCerrar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['DatosEjecucionDto'] }) =>
      ejecutar(api.PATCH('/api/renovaciones/{id}/cerrar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

export function useReabrir() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/renovaciones/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSettled: invalidar,
  })
}

/** Anular (eliminación lógica) o revertir la anulación. Solo admin. */
export function useAnulacionRenovacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, modo, motivo }: { id: number; modo: 'anular' | 'reversar'; motivo: string }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/renovaciones/{id}/anular', opciones))
        : ejecutar(api.POST('/api/renovaciones/{id}/reversar', opciones))
    },
    onSettled: invalidar,
  })
}
