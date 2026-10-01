import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

export type Respaldo = components['schemas']['RespaldoDto']
export type Etapa = Respaldo['etapa']
type DatosAlcance = components['schemas']['CreateRespaldoDto']
type DatosEjecucion = components['schemas']['RegistrarEjecucionDto']
type DatosPrueba = components['schemas']['RegistrarPruebaDto']
export type FiltrosApiRespaldos = NonNullable<
  paths['/api/respaldos']['get']['parameters']['query']
>

const claves = {
  todo: ['respaldos'] as const,
  lista: (filtros: FiltrosApiRespaldos) => ['respaldos', 'lista', filtros] as const,
  detalle: (id: number) => ['respaldos', 'detalle', id] as const,
}

export function useRespaldos(filtros: FiltrosApiRespaldos) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/respaldos', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useRespaldo(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/respaldos/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/** Tras cualquier cambio de capa se refrescan listados y detalle. */
function useInvalidarRespaldos() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: claves.todo })
}

/** Capa 1: definir el alcance (crea el respaldo). */
export function useCrearRespaldo() {
  const invalidar = useInvalidarRespaldos()
  return useMutation({
    mutationFn: (datos: DatosAlcance) => ejecutar(api.POST('/api/respaldos', { body: datos })),
    onSuccess: invalidar,
  })
}

/** Capa 2: registrar la ejecución. */
export function useRegistrarEjecucion() {
  const invalidar = useInvalidarRespaldos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosEjecucion }) =>
      ejecutar(
        api.PATCH('/api/respaldos/{id}/ejecucion', { params: { path: { id } }, body: datos }),
      ),
    onSuccess: invalidar,
  })
}

/** Capa 3: registrar la restauración/prueba. */
export function useRegistrarPrueba() {
  const invalidar = useInvalidarRespaldos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosPrueba }) =>
      ejecutar(
        api.PATCH('/api/respaldos/{id}/prueba', { params: { path: { id } }, body: datos }),
      ),
    onSuccess: invalidar,
  })
}
