import type { CredencialesGlpi, GlpiItem } from '../glpi-client.js';

export interface PeticionGlpi {
  metodo: string;
  ruta: string;
  cabeceras: Record<string, string>;
  /** Cuerpo del POST /token ya decodificado. */
  formulario?: Record<string, string>;
}

export interface DatosGlpiFalso {
  /** Elementos por tipo: { Computer: [...], Software: [...] } */
  elementos: Record<string, GlpiItem[]>;
  /** Rutas que deben fallar con 500 (p. ej. '/v2/Assets/Software'). */
  rutasRotas?: string[];
  /** Segundos de vida de cada token (por defecto 3600). */
  expiresIn?: number;
  /** true = el listado normal NO incluye la papelera (solo sale con is_deleted==1). */
  papeleraOculta?: boolean;
}

export const CREDENCIALES_PRUEBA: CredencialesGlpi = {
  clientId: 'cliente',
  clientSecret: 'secreto',
  usuario: 'sync',
  clave: 'clave-de-prueba',
  scope: 'api',
};

const json = (cuerpo: unknown, status = 200, cabeceras: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  });

/**
 * GLPI de mentira para las pruebas: imita el POST /token de OAuth2 (grant
 * "password") y los listados paginados de la API v2 con Content-Range.
 */
export function glpiFalso(datos: DatosGlpiFalso) {
  const peticiones: PeticionGlpi[] = [];
  const validos = new Set<string>();
  let emitidos = 0;

  const fetchFalso = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const ruta = url.pathname.replace(/^\/api\.php/, '');
    const cabeceras = init?.headers as Record<string, string>;
    const metodo = init?.method ?? 'GET';
    const peticion: PeticionGlpi = { metodo, ruta: `${ruta}${url.search}`, cabeceras };
    peticiones.push(peticion);

    if (ruta === '/token') {
      const formulario = Object.fromEntries(init?.body as URLSearchParams);
      peticion.formulario = formulario;
      const c = CREDENCIALES_PRUEBA;
      const correcto =
        metodo === 'POST' &&
        cabeceras['Content-Type'] === 'application/x-www-form-urlencoded' &&
        formulario.grant_type === 'password' &&
        formulario.client_id === c.clientId &&
        formulario.client_secret === c.clientSecret &&
        formulario.username === c.usuario &&
        formulario.password === c.clave &&
        formulario.scope === c.scope;
      if (!correcto) {
        return Promise.resolve(
          json({ error: 'invalid_grant', error_description: 'Credenciales incorrectas' }, 400),
        );
      }
      emitidos += 1;
      const token = `token-${emitidos}`;
      validos.add(token);
      return Promise.resolve(
        json({ token_type: 'Bearer', expires_in: datos.expiresIn ?? 3600, access_token: token }),
      );
    }

    const token = cabeceras.Authorization?.replace(/^Bearer /, '');
    if (!token || !validos.has(token)) {
      return Promise.resolve(json({ status: 'ERROR_UNAUTHENTICATED', title: 'No autenticado' }, 401));
    }
    if (datos.rutasRotas?.includes(ruta)) {
      return Promise.resolve(json({ status: 'ERROR_GENERIC', title: 'Fallo interno simulado' }, 500));
    }

    const tipo = /^\/v2\/Assets\/(\w+)$/.exec(ruta)?.[1];
    const todos = tipo ? datos.elementos[tipo] : undefined;
    if (!todos) {
      return Promise.resolve(json({ status: 'ERROR_ITEM_NOT_FOUND', title: 'Ruta desconocida' }, 404));
    }
    // Filtro RSQL, como el GLPI real: condiciones unidas por ";". La fecha se
    // compara en hora local del servidor, ignorando el desfase; un filtro
    // desconocido es un error 400, nunca una lista vacía.
    const filtro = url.searchParams.get('filter');
    let lista = todos;
    if (datos.papeleraOculta && !filtro?.includes('is_deleted==1')) {
      lista = lista.filter((x) => !x.is_deleted);
    }
    for (const condicion of filtro?.split(';') ?? []) {
      const fecha = /^date_mod=ge=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})$/.exec(condicion)?.[1];
      if (condicion === 'is_deleted==1') {
        lista = lista.filter((x) => x.is_deleted === true);
      } else if (fecha) {
        lista = lista.filter((x) => String(x.date_mod ?? '').slice(0, 19) >= fecha);
      } else {
        return Promise.resolve(
          json(
            { status: 'ERROR_INVALID_PARAMETER', title: 'RSQL query has invalid filters' },
            400,
          ),
        );
      }
    }
    const inicio = Number(url.searchParams.get('start') ?? 0);
    const limite = Number(url.searchParams.get('limit') ?? 100);
    const bloque = lista.slice(inicio, inicio + limite);
    const quedan = inicio + limite < lista.length;
    return Promise.resolve(
      json(bloque, quedan ? 206 : 200, {
        'Content-Range': `${inicio}-${inicio + bloque.length - 1}/${lista.length}`,
      }),
    );
  }) as typeof fetch;

  return {
    fetch: fetchFalso,
    peticiones,
    /** Rutas pedidas, sin la query string. */
    rutas: () => peticiones.map((p) => p.ruta.split('?')[0]),
    /** Tokens emitidos hasta ahora. */
    tokensEmitidos: () => emitidos,
    /** Simula que GLPI revoca o caduca todos los tokens. */
    invalidarTokens: () => validos.clear(),
  };
}
