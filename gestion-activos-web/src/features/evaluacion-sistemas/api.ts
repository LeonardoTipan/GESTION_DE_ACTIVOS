import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type EvaluacionSistema = components['schemas']['EvaluacionSistemaDto']
export type EstadoEvaluacion = EvaluacionSistema['estado']
export type FiltrosApiEvaluaciones = NonNullable<paths['/api/evaluaciones-sistemas']['get']['parameters']['query']>

const claves = {
  todo: ['evaluaciones-sistemas'] as const,
  lista: (f: FiltrosApiEvaluaciones) => ['evaluaciones-sistemas', 'lista', f] as const,
}

export function useEvaluaciones(filtros: FiltrosApiEvaluaciones) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/evaluaciones-sistemas', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

/**
 * Fase 1 · planificar la evaluación de un sistema. La invalidación va en onSettled (también
 * tras un error, p. ej. 409 porque el sistema ya tiene una pendiente).
 */
export function usePlanificarEvaluacion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: components['schemas']['PlanificarEvaluacionDto']) =>
      ejecutar(api.POST('/api/evaluaciones-sistemas', { body: datos })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: claves.todo }),
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
