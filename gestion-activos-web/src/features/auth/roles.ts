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

/**
 * Roles que pueden OPERAR (crear, registrar, ejecutar, editar) en los módulos
 * de inventario, respaldos, mantenimientos y vulnerabilidades. El auditor no
 * está: solo lectura.
 */
export const ROLES_OPERACION: readonly Rol[] = ['admin', 'analista']

/**
 * Roles para las acciones reservadas al administrador: aceptar el riesgo de
 * una vulnerabilidad, dar de baja un activo y gestionar catálogos.
 */
export const ROLES_ADMINISTRACION: readonly Rol[] = ['admin']

/** ¿Estos roles permiten operar? (versión pura de usePuedeOperar) */
export function puedeOperar(rolesDelUsuario: readonly Rol[]): boolean {
  return tieneRol(rolesDelUsuario, ROLES_OPERACION)
}

/** ¿Estos roles permiten las acciones de administrador? (versión pura de usePuedeAdministrar) */
export function puedeAdministrar(rolesDelUsuario: readonly Rol[]): boolean {
  return tieneRol(rolesDelUsuario, ROLES_ADMINISTRACION)
}
