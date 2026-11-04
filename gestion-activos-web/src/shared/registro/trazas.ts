import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { ejecutar } from '../api/errores.ts'
import type { EntidadTraza } from './registro.ts'

/** Trazas de un registro, de la más reciente a la más antigua. */
export function useTrazas(entidad: EntidadTraza, registroId: number, activo = true) {
  return useQuery({
    queryKey: ['trazas', entidad, registroId],
    queryFn: () => ejecutar(api.GET('/api/trazas', { params: { query: { entidad, registroId } } })),
    enabled: activo && registroId > 0,
  })
}
