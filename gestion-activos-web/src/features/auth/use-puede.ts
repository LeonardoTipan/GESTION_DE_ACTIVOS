import { tieneRol, type Rol } from './roles.ts'
import { useUsuarioActual } from './use-usuario-actual.ts'

/**
 * ¿El usuario actual tiene alguno de estos roles? Para mostrar u ocultar
 * acciones en la interfaz (la API vuelve a comprobarlo y responde 403).
 */
export function usePuede(roles: readonly Rol[]): boolean {
  const { data: usuario } = useUsuarioActual()
  return usuario ? tieneRol(usuario.roles, roles) : false
}
