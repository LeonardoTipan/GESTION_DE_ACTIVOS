/** Error de la API con su código HTTP y un mensaje listo para mostrar. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Convierte el cuerpo de error de la API ({ statusCode, message, error }) en
 * un texto legible. "message" puede ser un texto o una lista (un mensaje por
 * campo inválido).
 */
export function mensajeDeError(cuerpo: unknown, status?: number): string {
  if (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo) {
    const { message } = cuerpo as { message: unknown }
    if (Array.isArray(message)) return message.join(' · ')
    if (typeof message === 'string' && message) return message
  }
  if (status === 403) return 'No tienes permiso para realizar esta acción.'
  if (status && status >= 500) return 'Error interno del servidor. Inténtalo de nuevo.'
  return 'No se pudo completar la operación.'
}

/**
 * Espera una llamada de openapi-fetch y devuelve sus datos, o lanza ApiError.
 * Así las consultas y mutaciones de TanStack Query reciben un error uniforme.
 */
export async function ejecutar<T>(
  llamada: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await llamada
  if (!response.ok || error !== undefined) {
    throw new ApiError(response.status, mensajeDeError(error, response.status))
  }
  return data as T
}
