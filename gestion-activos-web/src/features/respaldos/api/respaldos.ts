import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

type S = components['schemas']
export type Plan = S['PlanRespaldoDto']
export type Ejecucion = S['EjecucionRespaldoDto']
export type Restauracion = S['RestauracionDto']
export type RespaldoAnterior = S['RespaldoDto']
export type Tablero = S['TableroRespaldosDto']
export type VentanaCalendario = Tablero['calendario'][number]['ejecucion'][number]
export type DatosPlanes = S['CrearPlanesDto']
export type DatosModificarPlan = S['ModificarPlanDto']
export type DatosEjecucion = S['RegistrarEjecucionDto']
export type DatosModificarEjecucion = S['ModificarEjecucionDto']
export type DatosRestauracion = S['RegistrarRestauracionDto']
export type DatosModificarRestauracion = S['ModificarRestauracionDto']

const RAIZ = ['respaldos'] as const
const PAGINA = { page: 1, limit: 100 } as const
export const TAMANO_PAGINA = 20

/** Filtros comunes a los tres listados (en la URL): valores reales de la API. */
export interface FiltrosRespaldo {
  page: number
  categoriaId?: number
  q?: string
  responsable?: string
  resultado?: Ejecucion['resultado']
}
const consulta = ({ page, ...f }: FiltrosRespaldo) => ({ ...f, page, limit: TAMANO_PAGINA })

/** Tras cualquier cambio se recalculan listados, tablero e inventario de operaciones. */
function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: RAIZ })
    void queryClient.invalidateQueries({ queryKey: ['trazas'] })
  }
}

export function useTablero(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...RAIZ, 'tablero', desde, hasta],
    queryFn: () => ejecutar(api.GET('/api/respaldos/tablero', { params: { query: { desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}

export function usePlanes() {
  return useQuery({
    queryKey: [...RAIZ, 'planes'],
    queryFn: () => ejecutar(api.GET('/api/respaldos/planes', { params: { query: PAGINA } })),
  })
}

/** Planes para el listado (filtrado y paginado); el formulario usa usePlanes(). */
export function usePlanesFiltrados(filtros: FiltrosRespaldo) {
  const { resultado: _, ...resto } = filtros
  return useQuery({
    queryKey: [...RAIZ, 'planes', 'listado', resto],
    queryFn: () => ejecutar(api.GET('/api/respaldos/planes', { params: { query: consulta(resto) } })),
    placeholderData: keepPreviousData,
  })
}

export function useEjecuciones(desde: string, hasta: string, filtros: FiltrosRespaldo) {
  return useQuery({
    queryKey: [...RAIZ, 'ejecuciones', desde, hasta, filtros],
    queryFn: () =>
      ejecutar(api.GET('/api/respaldos/ejecuciones', { params: { query: { ...consulta(filtros), desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}

/** Ejecuciones que se pueden restaurar: vigentes y no fallidas, de cualquier fecha. */
export function useEjecucionesRestaurables() {
  return useQuery({
    queryKey: [...RAIZ, 'ejecuciones', 'restaurables'],
    queryFn: async () => {
      const r = await ejecutar(
        api.GET('/api/respaldos/ejecuciones', { params: { query: { ...PAGINA, incluirAnulados: false } } }),
      )
      return r.data.filter((e) => e.resultado !== 'FALLIDO')
    },
  })
}

export function useRestauraciones(desde: string, hasta: string, filtros: FiltrosRespaldo) {
  return useQuery({
    queryKey: [...RAIZ, 'restauraciones', desde, hasta, filtros],
    queryFn: () =>
      ejecutar(api.GET('/api/respaldos/restauraciones', { params: { query: { ...consulta(filtros), desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}

export function useAnteriores() {
  return useQuery({
    queryKey: [...RAIZ, 'anteriores'],
    queryFn: () => ejecutar(api.GET('/api/respaldos/anteriores', { params: { query: PAGINA } })),
  })
}

export function useCrearPlanes() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: DatosPlanes) => ejecutar(api.POST('/api/respaldos/planes', { body: datos })),
    onSuccess: invalidar,
  })
}

export function useModificarPlan() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosModificarPlan }) =>
      ejecutar(api.PATCH('/api/respaldos/planes/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

export function useRegistrarEjecucion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: DatosEjecucion) => ejecutar(api.POST('/api/respaldos/ejecuciones', { body: datos })),
    onSuccess: invalidar,
  })
}

export function useModificarEjecucion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosModificarEjecucion }) =>
      ejecutar(api.PATCH('/api/respaldos/ejecuciones/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

export function useRegistrarRestauracion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: DatosRestauracion) => ejecutar(api.POST('/api/respaldos/restauraciones', { body: datos })),
    onSuccess: invalidar,
  })
}

export function useModificarRestauracion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosModificarRestauracion }) =>
      ejecutar(api.PATCH('/api/respaldos/restauraciones/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

export type TipoRegistro = 'planes' | 'ejecuciones' | 'restauraciones'

/** Anular o revertir un plan, una ejecución o una restauración (solo admin). */
export function useAnulacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({
      tipo,
      id,
      modo,
      motivo,
    }: {
      tipo: TipoRegistro
      id: number
      modo: 'anular' | 'reversar'
      motivo: string
    }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      if (tipo === 'planes') {
        return modo === 'anular'
          ? ejecutar(api.POST('/api/respaldos/planes/{id}/anular', opciones))
          : ejecutar(api.POST('/api/respaldos/planes/{id}/reversar', opciones))
      }
      if (tipo === 'ejecuciones') {
        return modo === 'anular'
          ? ejecutar(api.POST('/api/respaldos/ejecuciones/{id}/anular', opciones))
          : ejecutar(api.POST('/api/respaldos/ejecuciones/{id}/reversar', opciones))
      }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/respaldos/restauraciones/{id}/anular', opciones))
        : ejecutar(api.POST('/api/respaldos/restauraciones/{id}/reversar', opciones))
    },
    onSuccess: invalidar,
  })
}
