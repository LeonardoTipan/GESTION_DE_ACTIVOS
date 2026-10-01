import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'
import { claves } from './claves.ts'

export type Categoria = components['schemas']['CategoriaDto']
export type Criticidad = components['schemas']['CriticidadDto']
type DatosCategoria = components['schemas']['CreateCategoriaDto']
type DatosCriticidad = components['schemas']['CreateCriticidadDto']

/** Los catálogos cambian poco: se cachean 5 minutos. */
const CINCO_MINUTOS = 5 * 60 * 1000

export function useCategorias() {
  return useQuery({
    queryKey: claves.categorias,
    queryFn: () => ejecutar(api.GET('/api/categorias')),
    staleTime: CINCO_MINUTOS,
  })
}

export function useCriticidades() {
  return useQuery({
    queryKey: claves.criticidades,
    queryFn: () => ejecutar(api.GET('/api/criticidades')),
    staleTime: CINCO_MINUTOS,
  })
}

/** Crea (sin id) o modifica (con id) una categoría. */
export function useGuardarCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }: { id?: number; datos: DatosCategoria }) =>
      id
        ? ejecutar(api.PATCH('/api/categorias/{id}', { params: { path: { id } }, body: datos }))
        : ejecutar(api.POST('/api/categorias', { body: datos })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.categorias })
      // Los activos muestran el nombre de su categoría.
      void queryClient.invalidateQueries({ queryKey: claves.activos })
    },
  })
}

export function useEliminarCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(api.DELETE('/api/categorias/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.categorias }),
  })
}

/** Crea (sin id) o modifica (con id) un nivel de criticidad. */
export function useGuardarCriticidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }: { id?: number; datos: DatosCriticidad }) =>
      id
        ? ejecutar(api.PATCH('/api/criticidades/{id}', { params: { path: { id } }, body: datos }))
        : ejecutar(api.POST('/api/criticidades', { body: datos })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.criticidades })
      void queryClient.invalidateQueries({ queryKey: claves.activos })
    },
  })
}

export function useEliminarCriticidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(api.DELETE('/api/criticidades/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.criticidades }),
  })
}
