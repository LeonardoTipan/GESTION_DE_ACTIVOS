import createClient, { type Middleware } from 'openapi-fetch'
import { userManager } from '../features/auth/user-manager.ts'
import type { paths } from './schema'

/** Adjunta el token a cada petición y vuelve al login si la API responde 401. */
const autenticacion: Middleware = {
  async onRequest({ request }) {
    const user = await userManager.getUser()
    if (user && !user.expired) {
      request.headers.set('Authorization', `Bearer ${user.access_token}`)
    }
    return request
  },
  async onResponse({ response }) {
    if (response.status === 401) {
      await userManager.signinRedirect({
        state: { returnTo: window.location.pathname + window.location.search },
      })
    }
    return response
  },
}

/**
 * Cliente tipado de la API, generado desde /api/docs-json (npm run api:generate).
 * Rutas, parámetros y respuestas se comprueban en tiempo de compilación.
 */
export const api = createClient<paths>({ baseUrl: window.location.origin })
api.use(autenticacion)
