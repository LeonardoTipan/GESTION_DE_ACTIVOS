import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type EvaluacionSistema = components['schemas']['EvaluacionSistemaDto']
export type EstadoEvaluacion = EvaluacionSistema['estado']
export type SituacionEvaluacion = EvaluacionSistema['situacion']
export type FiltrosApiEvaluaciones = NonNullable<paths['/api/evaluaciones-sistemas']['get']['parameters']['query']>
export type FiltrosBitacoraEspecifica = NonNullable<paths['/api/evaluaciones-sistemas/bitacora/especifica']['get']['parameters']['query']>
export type DatosEjecucionEvaluacion = components['schemas']['DatosEjecucionEvaluacionDto']
export type ResumenBitacora = components['schemas']['ResumenBitacoraEvaluacionDto']

const claves = {
  todo: ['evaluaciones-sistemas'] as const,
  lista: (f: FiltrosApiEvaluaciones) => ['evaluaciones-sistemas', 'lista', f] as const,
  detalle: (id: number) => ['evaluaciones-sistemas', 'detalle', id] as const,
}

export function useEvaluaciones(filtros: FiltrosApiEvaluaciones) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/evaluaciones-sistemas', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useEvaluacion(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/evaluaciones-sistemas/{id}', { params: { path: { id } } })),
  })
}

/**
 * Tras cualquier operación (también tras un error, p. ej. 409 porque el sistema ya tiene una
 * pendiente) se refrescan el módulo, sus trazas, el panel y el calendario.
 */
function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: claves.todo })
    void queryClient.invalidateQueries({ queryKey: ['trazas'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['agenda'] })
  }
}

/** Fase 1 · planificar la evaluación de un sistema. */
export function usePlanificarEvaluacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: components['schemas']['PlanificarEvaluacionDto']) =>
      ejecutar(api.POST('/api/evaluaciones-sistemas', { body: datos })),
    onSettled: invalidar,
  })
}

/** Fase 2 · guardar avance (queda En progreso; no se cierra). */
export function useGuardarEjecucionEvaluacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosEjecucionEvaluacion }) =>
      ejecutar(api.PATCH('/api/evaluaciones-sistemas/{id}/ejecucion', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** Fase 2 · cerrar (fecha real de las pruebas, informe y repositorio; la observación si fue tardía). */
export function useCerrarEvaluacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosEjecucionEvaluacion }) =>
      ejecutar(api.PATCH('/api/evaluaciones-sistemas/{id}/cerrar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** Reabrir (solo admin, con motivo): vuelve a En progreso conservando los datos. */
export function useReabrirEvaluacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/evaluaciones-sistemas/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSettled: invalidar,
  })
}

/** Bitácora General por semestres (planificadas por fecha programada; cerradas por fecha real). */
export function useBitacoraGeneral(anio: number, semestre?: 1 | 2) {
  return useQuery({
    queryKey: [...claves.todo, 'bitacora', 'general', anio, semestre],
    queryFn: () => ejecutar(api.GET('/api/evaluaciones-sistemas/bitacora/general', { params: { query: { anio, semestre } } })),
  })
}

export function useBitacoraEspecifica(filtros: FiltrosBitacoraEspecifica) {
  return useQuery({
    queryKey: [...claves.todo, 'bitacora', 'especifica', filtros],
    queryFn: () => ejecutar(api.GET('/api/evaluaciones-sistemas/bitacora/especifica', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

/**
 * Pendientes con paso a producción en los próximos `dias` días (las vencidas incluidas), para
 * el tablero. La fecha límite se calcula al consultar, no al dibujar.
 */
export function useProximasEvaluaciones(dias: number) {
  return useQuery({
    queryKey: [...claves.todo, 'proximas', dias],
    queryFn: () =>
      ejecutar(
        api.GET('/api/evaluaciones-sistemas', {
          params: { query: { pendientes: true, hasta: new Date(Date.now() + dias * 86_400_000).toISOString(), page: 1, limit: 50 } },
        }),
      ),
  })
}
