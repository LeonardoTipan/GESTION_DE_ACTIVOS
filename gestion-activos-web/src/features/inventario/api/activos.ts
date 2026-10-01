import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'
import { claves } from './claves.ts'

export type Activo = components['schemas']['ActivoDto']
export type EntradaBitacora = components['schemas']['BitacoraDto']
export type DatosActivo = components['schemas']['CreateActivoDto']
/** Parámetros de GET /api/activos, tal como los define el contrato OpenAPI. */
export type FiltrosApiActivos = NonNullable<
  paths['/api/activos']['get']['parameters']['query']
>

export function useActivos(filtros: FiltrosApiActivos) {
  return useQuery({
    queryKey: claves.listaActivos(filtros),
    queryFn: () => ejecutar(api.GET('/api/activos', { params: { query: filtros } })),
    // Mientras carga la página siguiente, se sigue mostrando la actual (sin parpadeo).
    placeholderData: keepPreviousData,
  })
}

export function useActivo(id: number) {
  return useQuery({
    queryKey: claves.activo(id),
    queryFn: () =>
      ejecutar(api.GET('/api/activos/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

export function useBitacora(id: number, page: number) {
  return useQuery({
    queryKey: claves.bitacora(id, page),
    queryFn: () =>
      ejecutar(
        api.GET('/api/activos/{id}/bitacora', {
          params: { path: { id }, query: { page, limit: 10 } },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

/** Registra (sin id) o modifica (con id) un activo. */
export function useGuardarActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }: { id?: number; datos: DatosActivo }) =>
      id
        ? ejecutar(api.PATCH('/api/activos/{id}', { params: { path: { id } }, body: datos }))
        : ejecutar(api.POST('/api/activos', { body: datos })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.activos }),
  })
}

/** Baja lógica (solo admin). */
export function useDarDeBajaActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(api.DELETE('/api/activos/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.activos }),
  })
}
