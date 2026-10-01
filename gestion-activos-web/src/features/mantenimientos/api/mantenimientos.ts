import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

export type Mantenimiento = components['schemas']['MantenimientoDto']
export type Fase = Mantenimiento['fase']
export type TipoMantenimiento = Mantenimiento['tipo']
export type EstadoEquipo = NonNullable<Mantenimiento['estadoEquipo']>
type DatosProgramar = components['schemas']['ProgramarMantenimientoDto']
type DatosIniciar = components['schemas']['IniciarMantenimientoDto']
type DatosFinalizar = components['schemas']['FinalizarMantenimientoDto']
type DatosCancelar = components['schemas']['CancelarMantenimientoDto']
export type FiltrosApiMantenimientos = NonNullable<
  paths['/api/mantenimientos']['get']['parameters']['query']
>

const claves = {
  todo: ['mantenimientos'] as const,
  lista: (filtros: FiltrosApiMantenimientos) => ['mantenimientos', 'lista', filtros] as const,
  detalle: (id: number) => ['mantenimientos', 'detalle', id] as const,
}

export function useMantenimientos(filtros: FiltrosApiMantenimientos) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/mantenimientos', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useMantenimiento(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () =>
      ejecutar(api.GET('/api/mantenimientos/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/** Tras cualquier transición se refrescan listados y detalle. */
function useInvalidarMantenimientos() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: claves.todo })
}

/** Crea el mantenimiento en fase PROGRAMADO. */
export function useProgramarMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: (datos: DatosProgramar) =>
      ejecutar(api.POST('/api/mantenimientos', { body: datos })),
    onSuccess: invalidar,
  })
}

/** PROGRAMADO → EN_EJECUCION. */
export function useIniciarMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosIniciar }) =>
      ejecutar(
        api.PATCH('/api/mantenimientos/{id}/iniciar', { params: { path: { id } }, body: datos }),
      ),
    onSuccess: invalidar,
  })
}

/** EN_EJECUCION → FINALIZADO. */
export function useFinalizarMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosFinalizar }) =>
      ejecutar(
        api.PATCH('/api/mantenimientos/{id}/finalizar', {
          params: { path: { id } },
          body: datos,
        }),
      ),
    onSuccess: invalidar,
  })
}

/** PROGRAMADO o EN_EJECUCION → CANCELADO. */
export function useCancelarMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosCancelar }) =>
      ejecutar(
        api.PATCH('/api/mantenimientos/{id}/cancelar', {
          params: { path: { id } },
          body: datos,
        }),
      ),
    onSuccess: invalidar,
  })
}
