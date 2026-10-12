import type { CredencialesGlpi } from './glpi-client.js';
import type { ReglaCodigoInstitucional } from './mapeo.js';

/** Tipos de GLPI que sabe sincronizar el motor. */
export const ITEMTYPES = ['Computer', 'NetworkEquipment', 'Software'] as const;
export type Itemtype = (typeof ITEMTYPES)[number];

export interface GlpiSyncConfig {
  /** Base de la API de GLPI, p. ej. https://glpi.empresa.com/api.php */
  apiUrl: string;
  /** Versión de la API en la ruta (por defecto "v2"). */
  apiVersion: string;
  /**
   * ⚠️ Solo desarrollo: no valida el certificado HTTPS de GLPI
   * (GLPI_IGNORE_SSL=true). Prohibido con NODE_ENV=production.
   */
  ignorarSsl: boolean;
  /** OAuth2 "password": cliente + usuario de servicio. */
  credenciales: CredencialesGlpi;
  /** Zona horaria (IANA) del servidor GLPI: sus fechas llegan en hora local sin desfase. */
  zonaHoraria: string;
  itemtypes: Itemtype[];
  /** Elementos por petición (GLPI limita el rango máximo). */
  tamanoBloque: number;
  /** Tope de elementos por tipo (pruebas). Sin valor = todos. */
  maxPorTipo?: number;
  /** true = solo lee, compara e informa; no escribe nada en la base. */
  dryRun: boolean;
  /** Expresión de node-cron para el worker. */
  cron: string;
  /** Nivel de criticidad que reciben los activos creados desde GLPI. */
  criticidadPorDefecto: string;
  /** Cómo reconocer el código institucional en el comentario de GLPI. */
  codigoInstitucional: ReglaCodigoInstitucional;
  /** Categoría local (por nombre) de cada tipo de GLPI. */
  categoriaPorTipo: Record<Itemtype, string>;
  dirInformes: string;
  timeoutMs: number;
  databaseUrl: string;
}

type Env = Record<string, string | undefined>;

function entero(
  env: Env,
  nombre: string,
  porDefecto: number,
  errores: string[],
): number {
  const crudo = env[nombre]?.trim();
  if (!crudo) return porDefecto;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1) {
    errores.push(`${nombre} debe ser un entero positivo (recibido "${crudo}")`);
    return porDefecto;
  }
  return n;
}

function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee y valida la configuración del entorno. Si falta algo, lanza UN error
 * con la lista completa: el proceso no arranca a medias.
 */
export function leerConfig(env: Env): GlpiSyncConfig {
  const errores: string[] = [];
  const texto = (nombre: string): string => env[nombre]?.trim() ?? '';
  const obligatorio = (nombre: string): string => {
    const valor = texto(nombre);
    if (!valor) errores.push(`Falta ${nombre}`);
    return valor;
  };

  const apiUrl = obligatorio('GLPI_API_URL').replace(/\/+$/, '');
  if (apiUrl && !/^https?:\/\//i.test(apiUrl)) {
    errores.push('GLPI_API_URL debe empezar por http:// o https://');
  }
  // Las credenciales viajan en cada petición de token: fuera de la red local, solo por HTTPS.
  if (
    apiUrl.toLowerCase().startsWith('http://') &&
    texto('GLPI_PERMITIR_HTTP').toLowerCase() !== 'true'
  ) {
    const host = URL.parse(apiUrl)?.hostname ?? '';
    // Local: localhost, un servicio de Docker (sin punto) o host.docker.internal.
    const local =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      !host.includes('.') ||
      host.endsWith('.internal');
    if (!local) {
      errores.push(
        `GLPI_API_URL usa http:// con un servidor remoto (${host}): las credenciales viajarían sin cifrar. Usa https:// (o GLPI_PERMITIR_HTTP=true bajo tu responsabilidad)`,
      );
    }
  }
  const ignorarSsl = texto('GLPI_IGNORE_SSL').toLowerCase() === 'true';
  if (ignorarSsl && texto('NODE_ENV').toLowerCase() === 'production') {
    errores.push(
      'GLPI_IGNORE_SSL=true no está permitido con NODE_ENV=production: sin validar el certificado, las credenciales de GLPI quedan expuestas',
    );
  }
  const databaseUrl = obligatorio('DATABASE_URL');

  const credenciales: CredencialesGlpi = {
    clientId: obligatorio('GLPI_CLIENT_ID'),
    clientSecret: obligatorio('GLPI_CLIENT_SECRET'),
    usuario: obligatorio('GLPI_USERNAME'),
    // Sin trim: una contraseña puede empezar o acabar en espacio.
    clave: env.GLPI_PASSWORD ?? '',
    scope: texto('GLPI_SCOPE') || 'api',
  };
  if (!credenciales.clave) errores.push('Falta GLPI_PASSWORD');

  // Sin valor por defecto a propósito: una zona equivocada desplaza todas las fechas en silencio.
  const zonaHoraria = obligatorio('GLPI_TIMEZONE');
  if (zonaHoraria && !zonaValida(zonaHoraria)) {
    errores.push(
      `GLPI_TIMEZONE "${zonaHoraria}" no es una zona IANA válida (p. ej. America/Guayaquil)`,
    );
  }

  const itemtypes = (texto('GLPI_ITEMTYPES') || ITEMTYPES.join(','))
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const desconocidos = itemtypes.filter(
    (t) => !ITEMTYPES.includes(t as Itemtype),
  );
  if (desconocidos.length > 0) {
    errores.push(
      `GLPI_ITEMTYPES no admite: ${desconocidos.join(', ')} (válidos: ${ITEMTYPES.join(', ')})`,
    );
  }

  // Formato por defecto: cuatro grupos numéricos separados por guiones (7-1-22-177).
  const formatoCrudo =
    texto('GLPI_CODIGO_INSTITUCIONAL_FORMATO') || '^\\d+(-\\d+){3}$';
  let formatoInstitucional = /^$/;
  try {
    formatoInstitucional = new RegExp(formatoCrudo);
  } catch {
    errores.push(
      `GLPI_CODIGO_INSTITUCIONAL_FORMATO no es una expresión regular válida: "${formatoCrudo}"`,
    );
  }

  const maxCrudo = texto('GLPI_MAX_POR_TIPO');
  const config: GlpiSyncConfig = {
    apiUrl,
    apiVersion: texto('GLPI_API_VERSION') || 'v2',
    ignorarSsl,
    credenciales,
    zonaHoraria,
    itemtypes: itemtypes as Itemtype[],
    tamanoBloque: entero(env, 'GLPI_TAMANO_BLOQUE', 10, errores),
    maxPorTipo: maxCrudo
      ? entero(env, 'GLPI_MAX_POR_TIPO', 10, errores)
      : undefined,
    // Seguro por defecto: solo se escribe si se pide explícitamente con "false".
    dryRun: texto('GLPI_DRY_RUN').toLowerCase() !== 'false',
    cron: texto('GLPI_SYNC_CRON') || '0 2 * * *',
    criticidadPorDefecto: texto('GLPI_CRITICIDAD_DEFECTO') || 'Media',
    codigoInstitucional: {
      // Vacío = no se busca código institucional en los comentarios.
      etiqueta: texto('GLPI_CODIGO_INSTITUCIONAL_ETIQUETA'),
      formato: formatoInstitucional,
    },
    categoriaPorTipo: {
      Computer: texto('GLPI_CATEGORIA_COMPUTER') || 'Hardware',
      NetworkEquipment: texto('GLPI_CATEGORIA_NETWORKEQUIPMENT') || 'Red',
      Software: texto('GLPI_CATEGORIA_SOFTWARE') || 'Software',
    },
    dirInformes: texto('GLPI_DIR_INFORMES') || 'glpi-informes',
    timeoutMs: entero(env, 'GLPI_TIMEOUT_MS', 30_000, errores),
    databaseUrl,
  };

  if (errores.length > 0) {
    throw new Error(
      `Configuración de GLPI inválida:\n${errores.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
  return config;
}
