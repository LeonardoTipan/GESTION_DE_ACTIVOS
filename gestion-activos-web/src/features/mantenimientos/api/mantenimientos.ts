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

/** Corrige o reprograma (solo en fase PROGRAMADO). */
export function useEditarMantenimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['EditarMantenimientoDto'] }) =>
      ejecutar(api.PATCH('/api/mantenimientos/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.todo }),
  })
}

/**
 * Anular (eliminación lógica) o revertir la anulación. Solo admin. Nada se
 * borra: el registro queda marcado y deja de contar en los indicadores.
 */
export function useAnulacionMantenimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, modo, motivo }: { id: number; modo: 'anular' | 'reversar'; motivo: string }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/mantenimientos/{id}/anular', opciones))
        : ejecutar(api.POST('/api/mantenimientos/{id}/reversar', opciones))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.todo })
      void queryClient.invalidateQueries({ queryKey: ['trazas'] })
    },
  })
}

/** Indicadores del período (los anulados no cuentan). */
export function useIndicadoresMantenimiento(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...claves.todo, 'indicadores', desde, hasta],
    queryFn: () =>
      ejecutar(api.GET('/api/mantenimientos/indicadores', { params: { query: { desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}

// ── Capa 1 · Planificación ──────────────────────────────────────────────────

export type PlanMantenimiento = components['schemas']['PlanMantenimientoDto']
export type FrecuenciaMantenimiento = PlanMantenimiento['frecuencia']
export type TableroMantenimientos = components['schemas']['TableroMantenimientosDto']
export type FiltrosApiPlanes = NonNullable<
  paths['/api/mantenimientos/planes']['get']['parameters']['query']
>

export function usePlanesMantenimiento(filtros: FiltrosApiPlanes) {
  return useQuery({
    queryKey: [...claves.todo, 'planes', filtros],
    queryFn: () => ejecutar(api.GET('/api/mantenimientos/planes', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

/** Próximas intervenciones, activos sin plan, planes vencidos y pendientes de verificar. */
export function useTableroMantenimientos() {
  return useQuery({
    queryKey: [...claves.todo, 'tablero'],
    queryFn: () => ejecutar(api.GET('/api/mantenimientos/tablero')),
  })
}

/** Un plan por cada activo seleccionado (todos o ninguno). */
export function useCrearPlanesMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: (datos: components['schemas']['CrearPlanesMantenimientoDto']) =>
      ejecutar(api.POST('/api/mantenimientos/planes', { body: datos })),
    onSuccess: invalidar,
  })
}

export function useModificarPlanMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['ModificarPlanMantenimientoDto'] }) =>
      ejecutar(api.PATCH('/api/mantenimientos/planes/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

/** Crea el mantenimiento de la próxima fecha y adelanta el plan según su frecuencia. */
export function useProgramarDesdePlan() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(api.POST('/api/mantenimientos/planes/{id}/programar', { params: { path: { id } }, body: {} })),
    onSuccess: invalidar,
  })
}

export function useAnulacionPlanMantenimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, modo, motivo }: { id: number; modo: 'anular' | 'reversar'; motivo: string }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/mantenimientos/planes/{id}/anular', opciones))
        : ejecutar(api.POST('/api/mantenimientos/planes/{id}/reversar', opciones))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.todo })
      void queryClient.invalidateQueries({ queryKey: ['trazas'] })
    },
  })
}

// ── Capa 3 · Verificación y cierre ──────────────────────────────────────────

export type VerificacionMantenimiento = components['schemas']['VerificacionMantenimientoDto']
export type ResultadoVerificacion = VerificacionMantenimiento['resultado']
export type Cierre = Mantenimiento['cierre']

export function useVerificacionesMantenimiento(id: number) {
  return useQuery({
    queryKey: [...claves.detalle(id), 'verificaciones'],
    queryFn: () =>
      ejecutar(api.GET('/api/mantenimientos/{id}/verificaciones', { params: { path: { id } } })),
  })
}

export function useVerificarMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['RegistrarVerificacionMantenimientoDto'] }) =>
      ejecutar(api.POST('/api/mantenimientos/{id}/verificaciones', { params: { path: { id } }, body: datos })),
    onSuccess: invalidar,
  })
}

export function useAnularVerificacionMantenimiento() {
  const invalidar = useInvalidarMantenimientos()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.POST('/api/mantenimientos/verificaciones/{id}/anular', { params: { path: { id } }, body: { motivo } })),
    onSuccess: invalidar,
  })
}
