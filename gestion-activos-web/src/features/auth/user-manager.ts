import { UserManager, WebStorageStateStore } from 'oidc-client-ts'
import { config } from '../../config.ts'

/**
 * Cliente OIDC: Authorization Code + PKCE contra el realm de Keycloak.
 * Es una única instancia compartida por React (AuthProvider) y por el
 * cliente de la API, que la usa para adjuntar el access token.
 */
export const userManager = new UserManager({
  authority: config.oidc.authority,
  client_id: config.oidc.clientId,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  scope: 'openid',
  // Renueva el token antes de que expire (Keycloak lo emite por 5 minutos).
  automaticSilentRenew: true,
  // sessionStorage: la sesión no sobrevive al cerrar la pestaña.
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
})

/** Estado que viaja a Keycloak y vuelve: a qué ruta regresar tras el login. */
export interface EstadoLogin {
  returnTo: string
}
