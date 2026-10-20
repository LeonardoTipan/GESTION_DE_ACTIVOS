/** Fila tal como la devuelve GLPI (los campos dependen del tipo). */
export type GlpiItem = Record<string, unknown> & { id: number };

export class GlpiError extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    /** Código de error de GLPI u OAuth2, p. ej. invalid_grant. */
    readonly codigo?: string,
  ) {
    super(mensaje);
    this.name = 'GlpiError';
  }
}

/** Credenciales del flujo OAuth2 "password" de GLPI (POST /api.php/token). */
export interface CredencialesGlpi {
  clientId: string;
  clientSecret: string;
  usuario: string;
  clave: string;
  scope: string;
}

export interface OpcionesGlpiClient {
  /** Base de la API, p. ej. https://glpi.empresa.com/api.php */
  apiUrl: string;
  /** Versión de la API en la ruta, p. ej. "v2". */
  apiVersion: string;
  credenciales: CredencialesGlpi;
  timeoutMs: number;
  /** Inyectables para pruebas. */
  fetch?: typeof fetch;
  ahora?: () => number;
}

/** Se renueva el token si le queda menos de este margen (una petición lenta no lo pilla caducado). */
const MARGEN_RENOVACION_MS = 60_000;

/**
 * Cliente de la API REST v2 de GLPI (api.php), solo LECTURA.
 *
 * Autenticación OAuth2: pide el token con las credenciales, lo guarda SOLO en
 * memoria y lo renueva solo, antes de que caduque o si GLPI responde 401. El
 * token nunca se escribe en disco ni en los logs.
 */
export class GlpiClient {
  private token: { valor: string; caducaEn: number } | null = null;
  private readonly fetch: typeof fetch;
  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesGlpiClient) {
    this.fetch = opciones.fetch ?? fetch;
    this.ahora = opciones.ahora ?? Date.now;
  }

  /** POST /token (x-www-form-urlencoded) → access_token en memoria. */
  async autenticar(): Promise<void> {
    const { credenciales: c } = this.opciones;
    const respuesta = await this.enviar('/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: c.clientId,
        client_secret: c.clientSecret,
        username: c.usuario,
        password: c.clave,
        scope: c.scope,
      }),
    });
    if (!respuesta.ok) {
      throw await this.errorDe(respuesta, 'al pedir el token (/token)');
    }
    const cuerpo = (await respuesta.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!cuerpo.access_token) {
      throw new GlpiError('GLPI no devolvió access_token.', respuesta.status);
    }
    this.token = {
      valor: cuerpo.access_token,
      caducaEn: this.ahora() + (cuerpo.expires_in ?? 3600) * 1000,
    };
  }

  /** Olvida el token: la próxima petición pedirá uno nuevo. */
  cerrar(): void {
    this.token = null;
  }

  /**
   * Un ciclo de sincronización: token FRESCO al empezar y, pase lo que pase,
   * se descarta de la memoria al terminar.
   */
  async conSesion<T>(tarea: () => Promise<T>): Promise<T> {
    await this.autenticar();
    try {
      return await tarea();
    } finally {
      this.cerrar();
    }
  }

  /**
   * Recorre un tipo de activo por bloques (`start` + `limit`), en orden
   * estable por id. Se detiene al llegar al total que GLPI informa en
   * Content-Range o a `max`.
   *
   * `filtro` es una expresión RSQL de GLPI ("date_mod=ge=2026-10-12T14:00:00",
   * "is_deleted==1"). Un filtro que GLPI no entiende responde 400, no una lista vacía.
   */
  async *listarPorBloques(
    itemtype: string,
    { tamano, max, filtro }: { tamano: number; max?: number; filtro?: string },
  ): AsyncGenerator<GlpiItem[]> {
    let inicio = 0;
    let total = Number.POSITIVE_INFINITY;
    const tope = max ?? Number.POSITIVE_INFINITY;

    while (inicio < Math.min(total, tope)) {
      const limite = Math.min(tamano, tope - inicio);
      const consulta = new URLSearchParams({
        start: String(inicio),
        limit: String(limite),
        sort: 'id:asc',
      });
      if (filtro) consulta.set('filter', filtro);
      const respuesta = await this.get(
        `/${this.opciones.apiVersion}/Assets/${itemtype}?${consulta}`,
      );
      const bloque: unknown = await respuesta.json().catch(() => undefined);
      // Una respuesta que no es una lista NO equivale a "cero elementos":
      // es un fallo, y así debe tratarse para no sacar conclusiones falsas.
      if (!Array.isArray(bloque)) {
        throw new GlpiError(
          `GLPI devolvió una respuesta inesperada para ${itemtype} (se esperaba una lista).`,
          respuesta.status,
          'RESPUESTA_INESPERADA',
        );
      }
      if (bloque.length === 0) {
        // Vacío antes de llegar al total anunciado: la lectura quedó a medias
        // (el inventario cambió mientras se paginaba). No se da por completa.
        if (Number.isFinite(total) && inicio < Math.min(total, tope)) {
          throw new GlpiError(
            `GLPI anunció ${total} elementos de ${itemtype} pero solo entregó ${inicio}: lectura incompleta.`,
            respuesta.status,
            'LECTURA_INCOMPLETA',
          );
        }
        return;
      }
      yield bloque as GlpiItem[];

      // Content-Range: "0-9/137"
      const informado = Number(
        respuesta.headers.get('Content-Range')?.split('/')[1],
      );
      if (Number.isFinite(informado)) total = informado;
      else if (bloque.length < limite) return; // sin cabecera: bloque incompleto = último
      inicio += bloque.length;
    }
  }

  /** GET autenticado. Si el token caducó o GLPI lo rechaza (401), lo renueva y reintenta UNA vez. */
  private async get(ruta: string): Promise<Response> {
    let respuesta = await this.enviar(ruta, {
      headers: await this.cabeceras(),
    });
    if (respuesta.status === 401) {
      this.cerrar();
      respuesta = await this.enviar(ruta, { headers: await this.cabeceras() });
    }
    if (!respuesta.ok) throw await this.errorDe(respuesta, ruta.split('?')[0]);
    return respuesta; // 200, o 206 si quedan más resultados
  }

  private async cabeceras(): Promise<Record<string, string>> {
    if (!this.token || this.token.caducaEn - this.ahora() < MARGEN_RENOVACION_MS) {
      await this.autenticar();
    }
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token!.valor}`,
    };
  }

  private async enviar(ruta: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(`${this.opciones.apiUrl}${ruta}`, {
        ...init,
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
    } catch (error) {
      // fetch solo dice "fetch failed": la causa real (DNS, TLS, timeout) va en `cause`.
      const causa =
        error instanceof Error && error.cause instanceof Error
          ? error.cause
          : error;
      const codigo = (causa as { code?: string } | null)?.code;
      const detalle = causa instanceof Error ? causa.message : String(causa);
      const pista =
        codigo === 'CERT_HAS_EXPIRED'
          ? ' El certificado HTTPS del servidor GLPI ha caducado: debe renovarlo quien administra el servidor.'
          : '';
      throw new GlpiError(
        `No se pudo contactar con GLPI (${this.opciones.apiUrl}): ${detalle}${codigo ? ` [${codigo}]` : ''}.${pista}`,
        0,
        codigo,
      );
    }
  }

  /** Error legible a partir de la respuesta. Nunca incluye credenciales ni el token. */
  private async errorDe(respuesta: Response, donde: string): Promise<GlpiError> {
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    let codigo: string | undefined;
    let detalle: string | undefined;
    if (Array.isArray(cuerpo)) {
      [codigo, detalle] = cuerpo as string[];
    } else if (cuerpo && typeof cuerpo === 'object') {
      // OAuth2: { error, error_description } · API v2: { status, title, detail }
      const c = cuerpo as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === 'string' ? v : undefined);
      codigo = texto(c.error) ?? texto(c.status);
      detalle =
        texto(c.error_description) ??
        texto(c.detail) ??
        texto(c.title) ??
        texto(c.message);
    }
    return new GlpiError(
      `GLPI respondió ${respuesta.status}${codigo ? ` ${codigo}` : ''}${detalle ? `: ${detalle}` : ''} (${donde})`,
      respuesta.status,
      codigo,
    );
  }
}
