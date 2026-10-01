import type { components } from '../../api/schema'

/** Usuario autenticado tal como lo devuelve GET /api/auth/me. */
export type UsuarioActual = components['schemas']['AuthUserDto']

/** Roles de la aplicación (los mismos que valida la API). */
export type Rol = UsuarioActual['roles'][number]

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  analista: 'Analista',
  auditor: 'Auditor',
}

/**
 * ¿El usuario tiene alguno de los roles pedidos? Una lista vacía significa
 * "cualquier usuario autenticado". Solo decide qué se MUESTRA: la seguridad
 * real la aplica la API (403).
 */
export function tieneRol(
  rolesDelUsuario: readonly Rol[],
  rolesPermitidos: readonly Rol[],
): boolean {
  return (
    rolesPermitidos.length === 0 ||
    rolesDelUsuario.some((rol) => rolesPermitidos.includes(rol))
  )
}
