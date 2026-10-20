/** Longitud de nuestras columnas VARCHAR de MySQL (Prisma `String` sin @db.Text). */
export const MAX_TEXTO = 191;

export interface Truncado {
  valor: string;
  truncado: boolean;
  longitudOriginal: number;
}

/**
 * Recorta un texto a `max` caracteres. Cuenta por puntos de código (como
 * MySQL utf8mb4), así nunca parte un emoji o carácter compuesto por la mitad.
 * El último carácter se sustituye por "…" para que el recorte sea visible.
 */
export function truncar(texto: string, max = MAX_TEXTO): Truncado {
  const caracteres = Array.from(texto);
  if (caracteres.length <= max) {
    return { valor: texto, truncado: false, longitudOriginal: caracteres.length };
  }
  return {
    valor: `${caracteres.slice(0, max - 1).join('')}…`,
    truncado: true,
    longitudOriginal: caracteres.length,
  };
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
};

/** GLPI devuelve algunos textos con entidades HTML ("Sede &#62; Piso 2"). */
export function decodificarHtml(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, codigo: string) =>
      String.fromCodePoint(Number(codigo)),
    )
    .replace(/&(amp|lt|gt|quot|nbsp);/g, (entidad) => ENTIDADES[entidad]);
}

/**
 * Texto limpio de un campo de GLPI, o null si viene vacío.
 * En la API v2 los campos relacionados (usuario, ubicación, modelo…) llegan
 * como objeto `{ id, name }`: se toma su nombre.
 */
export function textoGlpi(valor: unknown): string | null {
  if (valor !== null && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    return textoGlpi(o.completename) ?? textoGlpi(o.name) ?? textoGlpi(o.username);
  }
  if (typeof valor !== 'string') return null;
  const limpio = decodificarHtml(valor).replace(/\s+/g, ' ').trim();
  return limpio === '' || limpio === '0' ? null : limpio;
}

const FECHA_GLPI =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Desfase (ms) de una zona IANA respecto a UTC en un instante dado. */
function desfaseMs(instante: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante));
  const n = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(
    n('year'),
    n('month') - 1,
    n('day'),
    n('hour'),
    n('minute'),
    n('second'),
  );
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/**
 * "2026-10-01 09:30:00" en la hora LOCAL del servidor GLPI → instante UTC.
 * GLPI no envía desfase, así que se aplica el de `zona` (con su horario de
 * verano si lo tiene). Devuelve null si la fecha viene vacía o no es válida.
 */
export function fechaGlpiAUtc(valor: unknown, zona: string): Date | null {
  if (typeof valor !== 'string') return null;
  // Si la fecha ya trae desfase (ISO 8601 con Z o ±hh:mm), es inequívoca.
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(valor.trim())) {
    const fecha = new Date(valor.trim());
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const m = FECHA_GLPI.exec(valor.trim());
  if (!m) return null;
  const [anio, mes, dia, hora, minuto, segundo] = m
    .slice(1)
    .map((p) => Number(p ?? 0));
  if (anio === 0 || mes === 0 || dia === 0) return null; // "0000-00-00 00:00:00"

  const comoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo);
  if (new Date(comoUtc).getUTCDate() !== dia) return null; // p. ej. 31 de febrero

  // Dos pasadas: la segunda corrige el desfase cerca de un cambio de horario.
  let instante = comoUtc - desfaseMs(comoUtc, zona);
  instante = comoUtc - desfaseMs(instante, zona);
  return new Date(instante);
}

/** Tope de los campos TEXT (el mismo que aplica la API a los textos largos). */
export const MAX_TEXTO_LARGO = 5000;

/**
 * Texto de varias líneas de GLPI (p. ej. `comment`), o null si viene vacío.
 * Conserva los saltos de línea (unificados a "\n") y quita los espacios
 * sobrantes al final de cada línea, para que la comparación sea estable.
 */
export function textoLargoGlpi(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = decodificarHtml(valor)
    .split(/\r\n|\r|\n/)
    .map((linea) => linea.trimEnd())
    .join('\n')
    .trim();
  return limpio === '' ? null : limpio;
}

/**
 * Instante → "2026-10-12T14:04:31" en la hora LOCAL de la zona. Es el formato
 * que entiende el filtro de fechas de GLPI: comprobado contra el servidor real,
 * interpreta el valor en su hora local e IGNORA cualquier desfase que se le envíe.
 */
export function fechaLocalDeZona(fecha: Date, zona: string): string {
  const local = new Date(fecha.getTime() + desfaseMs(fecha.getTime(), zona));
  return local.toISOString().slice(0, 19);
}

/**
 * ¿La fecha que envía GLPI ("…-05:00") lleva el mismo desfase que la zona
 * configurada? null si la fecha no trae desfase (no se puede comprobar).
 */
export function desfaseCoincide(valor: unknown, zona: string): boolean | null {
  if (typeof valor !== 'string') return null;
  const m = /T.*(Z|([+-])(\d{2}):?(\d{2}))$/i.exec(valor.trim());
  const instante = new Date(valor.trim()).getTime();
  if (!m || Number.isNaN(instante)) return null;
  const minutos =
    m[1].toUpperCase() === 'Z'
      ? 0
      : (m[2] === '-' ? -1 : 1) * (Number(m[3]) * 60 + Number(m[4]));
  return desfaseMs(instante, zona) === minutos * 60_000;
}
