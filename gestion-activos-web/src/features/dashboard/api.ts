import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type Pendientes = components['schemas']['PendientesTableroDto']

/** Trámites abiertos o en curso por módulo (GET /api/dashboard/pendientes). */
export function usePendientes() {
  return useQuery({
    queryKey: ['dashboard', 'pendientes'],
    queryFn: () => ejecutar(api.GET('/api/dashboard/pendientes')),
  })
}
