import { useQuery } from '@tanstack/react-query'
import { useAuth } from 'react-oidc-context'
import { api } from '../../api/client.ts'
import type { UsuarioActual } from './roles.ts'

/**
 * Usuario y roles según la API (GET /api/auth/me): la fuente de verdad es el
 * backend, no el token decodificado en el navegador.
 */
export function useUsuarioActual() {
  const auth = useAuth()
  return useQuery({
    queryKey: ['auth', 'me'],
    enabled: auth.isAuthenticated,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UsuarioActual> => {
      const { data, error } = await api.GET('/api/auth/me')
      if (error || !data) {
        throw new Error('No se pudo obtener el usuario desde la API.')
      }
      return data
    },
  })
}
