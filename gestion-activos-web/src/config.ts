/** Lee una variable de entorno de Vite y falla al arrancar si falta. */
function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable ${nombre} en gestion-activos-web/.env (ver .env.example).`,
    )
  }
  return valor
}

export const config = {
  oidc: {
    authority: requerida('VITE_OIDC_AUTHORITY', import.meta.env.VITE_OIDC_AUTHORITY),
    clientId: requerida('VITE_OIDC_CLIENT_ID', import.meta.env.VITE_OIDC_CLIENT_ID),
  },
} as const
