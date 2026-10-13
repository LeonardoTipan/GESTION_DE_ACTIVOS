import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

export type EstadoSincronizacion = components['schemas']['EstadoSincronizacionDto']
export type ResultadoSincronizacion = components['schemas']['ResultadoSincronizacionDto']
export type Notificacion = components['schemas']['NotificacionDto']

export const clavesGlpi = {
  estado: ['glpi', 'estado'] as const,
  notificaciones: ['glpi', 'notificaciones'] as const,
  resumen: ['glpi', 'notificaciones', 'resumen'] as const,
  lista: (soloNoLeidas: boolean) => ['glpi', 'notificaciones', 'lista', soloNoLeidas] as const,
}

/** Cada cuánto se vuelve a preguntar: la sincronización automática corre en el servidor. */
const REFRESCO_MS = 60_000

/** Si hay una sincronización en curso y cuándo fue la última sin errores. */
export function useEstadoSincronizacion() {
  return useQuery({
    queryKey: clavesGlpi.estado,
    queryFn: () => ejecutar(api.GET('/api/glpi/sincronizacion')),
    // Mientras otra ejecución escribe, se consulta más a menudo para liberar el botón.
    refetchInterval: (query) => (query.state.data?.enCurso ? 3_000 : REFRESCO_MS),
  })
}

/**
 * Lanza la sincronización en el servidor. Al terminar se refresca TODO lo que
 * hay en pantalla: inventario, fichas, historiales, avisos y estado.
 */
export function useSincronizar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (completa: boolean) =>
      ejecutar(api.POST('/api/glpi/sincronizacion', { body: { completa } })),
    onSettled: () => queryClient.invalidateQueries(),
  })
}

export function useResumenNotificaciones() {
  return useQuery({
    queryKey: clavesGlpi.resumen,
    queryFn: () => ejecutar(api.GET('/api/notificaciones/resumen')),
    refetchInterval: REFRESCO_MS,
  })
}

export function useNotificaciones(soloNoLeidas: boolean, { enabled = true } = {}) {
  return useQuery({
    queryKey: clavesGlpi.lista(soloNoLeidas),
    queryFn: () =>
      ejecutar(
        api.GET('/api/notificaciones', {
          params: { query: { page: 1, limit: 20, soloNoLeidas } },
        }),
      ),
    enabled,
  })
}

export function useMarcarLeida() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(api.PATCH('/api/notificaciones/{id}/leida', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clavesGlpi.notificaciones }),
  })
}

export function useMarcarTodasLeidas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => ejecutar(api.POST('/api/notificaciones/marcar-leidas')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clavesGlpi.notificaciones }),
  })
}
