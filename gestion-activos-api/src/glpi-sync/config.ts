import type { CredencialesGlpi } from './glpi-client.js';
import type { OrigenEjecucion } from './inventario-local.js';
import type { ReglaCodigoInstitucional } from './mapeo.js';

/**
 * Tipos de activo de GLPI que sabe sincronizar el motor: los de la API v2.2
 * (GET /Assets) que tienen listado propio. Cada uno con su categoría local
 * (el catálogo de clasificación del inventario) y el prefijo del código de
 * respaldo ("GLPI-MON-7"). `fisico`: lleva etiqueta institucional (los programas,
 * licencias, certificados y aplicativos no). `papelera`: GLPI admite filtrar por
 * is_deleted (las tomas de red no tienen papelera: el filtro responde 400).
 *
 * No están, a propósito: cartuchos y consumibles (la API no ofrece su
 * listado: solo los de un artículo concreto, y GET /Assets/Cartridge responde
 * 500), tarjetas SIM (son componentes de otro activo: /Components/SIMCard),
 * "Global" (vista de todos los activos físicos, no un tipo) y los activos no
 * administrados (la cuenta de servicio no tiene permiso: 403).
 */
export const TIPOS_GLPI = {
  Computer: { categoria: 'Computadoras', prefijo: 'PC', fisico: true, papelera: true },
  Monitor: { categoria: 'Monitores', prefijo: 'MON', fisico: true, papelera: true },
  Software: { categoria: 'Programas', prefijo: 'SW', fisico: false, papelera: true },
  NetworkEquipment: { categoria: 'Dispositivos de redes', prefijo: 'RED', fisico: true, papelera: true },
  Peripheral: { categoria: 'Periféricos', prefijo: 'PER', fisico: true, papelera: true },
  Printer: { categoria: 'Impresoras', prefijo: 'IMP', fisico: true, papelera: true },
  Phone: { categoria: 'Teléfonos', prefijo: 'TEL', fisico: true, papelera: true },
  Rack: { categoria: 'Racks', prefijo: 'RACK', fisico: true, papelera: true },
  Enclosure: { categoria: 'Gabinetes', prefijo: 'GAB', fisico: true, papelera: true },
  PDU: { categoria: 'Multitomas', prefijo: 'PDU', fisico: true, papelera: true },
  PassiveDCEquipment: { categoria: 'Dispositivos pasivos', prefijo: 'PAS', fisico: true, papelera: true },
  Cable: { categoria: 'Cables', prefijo: 'CAB', fisico: true, papelera: true },
  Socket: { categoria: 'Tomas de red', prefijo: 'TOM', fisico: true, papelera: false },
  SoftwareLicense: { categoria: 'Licencias', prefijo: 'LIC', fisico: false, papelera: true },
  Certificate: { categoria: 'Certificados', prefijo: 'CER', fisico: false, papelera: true },
  Appliance: { categoria: 'Aplicativos', prefijo: 'APL', fisico: false, papelera: true },
} as const;
export type Itemtype = keyof typeof TIPOS_GLPI;
export const ITEMTYPES = Object.keys(TIPOS_GLPI) as Itemtype[];

/** Categoría local de cada tipo, salvo que GLPI_CATEGORIA_<TIPO> diga otra. */
export const CATEGORIAS_POR_DEFECTO = Object.fromEntries(
  ITEMTYPES.map((t) => [t, TIPOS_GLPI[t].categoria]),
) as Record<Itemtype, string>;

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
  /**
   * Política explícita de códigos: un activo vinculado que sigue con el código de
   * respaldo ("GLPI-PC-12") pasa a su código institucional o n.º de inventario
   * cuando es válido y único. Nunca toca un código puesto a mano.
   */
  mejorarCodigos: boolean;
  /**
   * Qué leer de GLPI:
   *  - "auto": incremental (solo lo modificado desde el último punto de control)
   *    y, cada `reconciliacionHoras`, una lectura completa que detecta bajas.
   *    El botón manual NO dispara esa reconciliación periódica: es siempre rápido.
   *  - "completa" / "incremental": se fuerza. Sin punto de control siempre es completa.
   */
  modo: 'auto' | 'completa' | 'incremental';
  /** Quién lanza la ejecución (queda en el registro). */
  origen: OrigenEjecucion;
  /** Usuario que pulsó el botón (solo origen MANUAL). */
  solicitadaPor?: string;
  /**
   * Minutos que se retrocede desde el punto de control al pedir "lo modificado
   * desde…": absorbe diferencias de reloj con GLPI y cambios hechos mientras
   * corría la ejecución anterior. Releer de más es inocuo (idempotente).
   */
  ventanaSeguridadMin: number;
  /** Cada cuántas horas la ejecución automática hace la reconciliación completa. */
  reconciliacionHoras: number;
  /** Minutos tras los que el bloqueo de una ejecución caída se da por abandonado. */
  bloqueoCaducaMin: number;
  /**
   * Una lectura completa en la que desaparece buena parte del inventario suele
   * ser un problema de permisos en GLPI, no una baja real: no se aplica salvo
   * que se confirme expresamente (--confirmar-bajas).
   */
  confirmarBajasMasivas: boolean;
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

  const modo = texto('GLPI_SYNC_MODO').toLowerCase() || 'auto';
  if (!['auto', 'completa', 'incremental'].includes(modo)) {
    errores.push(
      `GLPI_SYNC_MODO debe ser auto, completa o incremental (recibido "${modo}")`,
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
    mejorarCodigos: texto('GLPI_MEJORAR_CODIGOS').toLowerCase() === 'true',
    modo: modo as GlpiSyncConfig['modo'],
    origen: 'CONSOLA',
    ventanaSeguridadMin: entero(env, 'GLPI_VENTANA_SEGURIDAD_MIN', 15, errores),
    reconciliacionHoras: entero(env, 'GLPI_RECONCILIACION_HORAS', 24, errores),
    bloqueoCaducaMin: entero(env, 'GLPI_BLOQUEO_CADUCA_MIN', 30, errores),
    confirmarBajasMasivas: false,
    // Con la lectura incremental cada ejecución es ligera: por defecto, cada 15 minutos.
    cron: texto('GLPI_SYNC_CRON') || '*/15 * * * *',
    criticidadPorDefecto: texto('GLPI_CRITICIDAD_DEFECTO') || 'Media',
    codigoInstitucional: {
      // Vacío = no se busca código institucional en los comentarios.
      etiqueta: texto('GLPI_CODIGO_INSTITUCIONAL_ETIQUETA'),
      formato: formatoInstitucional,
    },
    categoriaPorTipo: Object.fromEntries(
      ITEMTYPES.map((t) => [t, texto(`GLPI_CATEGORIA_${t.toUpperCase()}`) || CATEGORIAS_POR_DEFECTO[t]]),
    ) as Record<Itemtype, string>,
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
