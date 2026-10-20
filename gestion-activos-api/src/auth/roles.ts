/**
 * Roles de la aplicación. Deben coincidir con los roles del realm
 * "gestion-activos" en Keycloak (keycloak/realm-gestion-activos.json).
 */
export const APP_ROLES = ['admin', 'analista', 'auditor'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(role: string): role is AppRole {
  return (APP_ROLES as readonly string[]).includes(role);
}
