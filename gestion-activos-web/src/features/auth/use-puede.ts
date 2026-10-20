import { puedeAdministrar, puedeOperar, tieneRol, type Rol } from './roles.ts'
import { useUsuarioActual } from './use-usuario-actual.ts'

/**
 * ¿El usuario actual tiene alguno de estos roles? Para mostrar u ocultar
 * acciones en la interfaz (la API vuelve a comprobarlo y responde 403).
 */
export function usePuede(roles: readonly Rol[]): boolean {
  const { data: usuario } = useUsuarioActual()
  return usuario ? tieneRol(usuario.roles, roles) : false
}

/**
 * ¿Puede el usuario actual operar (crear, registrar, ejecutar, editar)?
 * Usar SIEMPRE este hook para mostrar botones y formularios de acción: así el
 * auditor nunca los ve, en ningún módulo.
 */
export function usePuedeOperar(): boolean {
  const { data: usuario } = useUsuarioActual()
  return usuario ? puedeOperar(usuario.roles) : false
}

/**
 * ¿Puede el usuario actual hacer las acciones reservadas al admin (aceptar
 * riesgo, dar de baja, catálogos)? Ni el analista ni el auditor.
 */
export function usePuedeAdministrar(): boolean {
  const { data: usuario } = useUsuarioActual()
  return usuario ? puedeAdministrar(usuario.roles) : false
}
