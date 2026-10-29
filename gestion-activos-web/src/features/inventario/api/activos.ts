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

/** Estados presentes en el inventario, con su recuento (filtro dinámico). */
export function useEstadosActivo() {
  return useQuery({
    queryKey: [...claves.activos, 'estados'],
    queryFn: () => ejecutar(api.GET('/api/activos/estados')),
  })
}

export function useActivo(id: number, { enabled = true } = {}) {
  return useQuery({
    queryKey: claves.activo(id),
    queryFn: () =>
      ejecutar(api.GET('/api/activos/{id}', { params: { path: { id } } })),
    retry: false,
    enabled,
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

/** Categorías que tienen activos, con su recuento (selectores de activos de los módulos). */
/** Módulo cuyos activos elegibles se piden (bandera de la categoría en Catálogos). */
export type Aplicacion = NonNullable<FiltrosApiActivos['aplica']>

export function useCategoriasConActivos({ operativos, aplica }: { operativos: boolean; aplica?: Aplicacion }) {
  return useQuery({
    queryKey: [...claves.activos, 'categorias', operativos, aplica],
    queryFn: () =>
      ejecutar(api.GET('/api/activos/categorias', { params: { query: { operativos, aplica } } })),
  })
}

/**
 * Todos los activos operativos de unos niveles de criticidad (y, si se indica,
 * de una categoría), recorriendo las páginas de la API.
 */
export async function activosOperativosPorCriticidad(
  criticidadIds: number[],
  categoriaId?: number,
  aplica?: Aplicacion,
): Promise<Activo[]> {
  const todos: Activo[] = []
  for (const criticidadId of criticidadIds) {
    for (let page = 1; ; page++) {
      const r = await ejecutar(
        api.GET('/api/activos', {
          params: { query: { operativos: true, aplica, criticidadId, categoriaId, page, limit: 100, sort: 'codigo', order: 'asc' } },
        }),
      )
      todos.push(...r.data)
      if (page >= r.meta.totalPages) break
    }
  }
  return todos
}
