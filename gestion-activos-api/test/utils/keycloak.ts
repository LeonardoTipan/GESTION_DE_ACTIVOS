import 'dotenv/config';

/** Pide un access token real a Keycloak (Direct Access Grant, solo desarrollo). */
export async function getToken(
  username: string,
  password = process.env.KEYCLOAK_TEST_PASSWORD ?? '',
  realm = process.env.KEYCLOAK_REALM ?? '',
  clientId = 'gestion-activos-web',
): Promise<string> {
  const res = await fetch(
    `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username,
        password,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `No se pudo obtener el token de ${username}: HTTP ${res.status}`,
    );
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Tokens de los tres usuarios de prueba, uno por rol. */
export async function getTokensDePrueba() {
  const [admin, analista, auditor] = await Promise.all([
    getToken('admin.test'),
    getToken('analista.test'),
    getToken('auditor.test'),
  ]);
  return { admin, analista, auditor };
}

/** Cambia un carácter en medio de la firma: el token sigue "bien formado" pero es falso. */
export function tamper(token: string): string {
  const [header, payload, signature] = token.split('.');
  const i = Math.floor(signature.length / 2);
  const swapped = signature[i] === 'A' ? 'B' : 'A';
  return `${header}.${payload}.${signature.slice(0, i)}${swapped}${signature.slice(i + 1)}`;
}
