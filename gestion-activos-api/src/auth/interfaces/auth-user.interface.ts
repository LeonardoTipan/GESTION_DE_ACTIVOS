import type { AppRole } from '../roles.js';

/** Claims del access token de Keycloak que usa la API. */
export interface KeycloakJwtPayload {
  sub: string;
  preferred_username: string;
  email?: string;
  name?: string;
  realm_access?: { roles: string[] };
}

/** Usuario autenticado, disponible en request.user y con @CurrentUser(). */
export interface AuthUser {
  /** ID inmutable del usuario en Keycloak (claim "sub"). */
  id: string;
  username: string;
  email?: string;
  name?: string;
  /** Solo los roles de la aplicación; se descartan los internos de Keycloak. */
  roles: AppRole[];
}
