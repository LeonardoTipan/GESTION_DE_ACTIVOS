import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type PeriodoEndpoint = components['schemas']['PeriodoEndpointDto']
export type EstadoPeriodo = PeriodoEndpoint['estado']
export type FiltrosApiPeriodos = NonNullable<paths['/api/proteccion-endpoints/periodos']['get']['parameters']['query']>

const claves = {
  todo: ['proteccion-endpoints'] as const,
  lista: (f: FiltrosApiPeriodos) => ['proteccion-endpoints', 'periodos', f] as const,
}

export function usePeriodos(filtros: FiltrosApiPeriodos) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

/**
 * Fase 1 · abrir un período mensual. La invalidación va en onSettled (también tras un
 * error, p. ej. 409 porque otra persona abrió el mismo mes): la tabla muestra lo confirmado.
 */
export function useAbrirPeriodo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: components['schemas']['AbrirPeriodoDto']) =>
      ejecutar(api.POST('/api/proteccion-endpoints/periodos', { body: datos })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: claves.todo }),
  })
}
