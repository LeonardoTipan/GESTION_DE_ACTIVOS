/**
 * Ventanas programadas de un plan de respaldo según su frecuencia: en qué
 * períodos debía haber una ejecución (o una prueba de restauración). Funciones
 * puras sobre fechas "AAAA-MM-DD" en UTC.
 */

export type FrecuenciaVentana =
  | 'DIARIO'
  | 'SEMANAL'
  | 'QUINCENAL'
  | 'MENSUAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

export interface Ventana {
  ini: string;
  fin: string;
  /** Rótulo corto para el calendario: "jul 2026", "T3 2026", "07/07–13/07". */
  corto: string;
  /** Texto completo: "julio de 2026". */
  etiqueta: string;
}

export type EstadoVentana = 'CUMPLIDA' | 'VENCIDA' | 'EN_CURSO' | 'PROGRAMADA';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const aFecha = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const aTexto = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (anio: number, mes: number, diaMes: number): Date =>
  new Date(Date.UTC(anio, mes, diaMes));
const dd = (d: Date) => String(d.getUTCDate()).padStart(2, '0');
const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, '0');

/** Tope de ventanas por plan: una frecuencia diaria sobre "todo el histórico" no desborda. */
const MAX_VENTANAS = 400;

/**
 * Ventanas de `frecuencia` desde que el plan rige hasta el fin del período,
 * recortadas al período. No se generan ventanas más allá del año siguiente.
 */
export function ventanasDe(
  frecuencia: FrecuenciaVentana,
  vigenteDesde: string,
  periodo: { ini: string; fin: string },
  hoy: string,
): Ventana[] {
  const desde = aFecha(vigenteDesde > periodo.ini ? vigenteDesde : periodo.ini);
  const tope = `${Number(hoy.slice(0, 4)) + 1}-12-31`;
  const fin = aFecha(periodo.fin < tope ? periodo.fin : tope);
  const salida: Ventana[] = [];
  const agregar = (a: Date, b: Date, corto: string, etiqueta: string) => {
    const i = a < desde ? desde : a;
    const f = b > fin ? fin : b;
    if (f < desde || i > fin || salida.length >= MAX_VENTANAS) return;
    salida.push({ ini: aTexto(i), fin: aTexto(f), corto, etiqueta });
  };
  let y = desde.getUTCFullYear();
  let m = desde.getUTCMonth();

  switch (frecuencia) {
    case 'TRIMESTRAL': {
      let q = Math.floor(m / 3);
      while (utc(y, q * 3, 1) <= fin && salida.length < MAX_VENTANAS) {
        agregar(utc(y, q * 3, 1), utc(y, q * 3 + 3, 0), `T${q + 1} ${y}`, `${q + 1}.º trimestre de ${y}`);
        if (++q > 3) { q = 0; y++; }
      }
      break;
    }
    case 'SEMESTRAL': {
      let s = m < 6 ? 0 : 6;
      while (utc(y, s, 1) <= fin && salida.length < MAX_VENTANAS) {
        agregar(utc(y, s, 1), utc(y, s + 6, 0), `S${s / 6 + 1} ${y}`, `${s === 0 ? 'primer' : 'segundo'} semestre de ${y}`);
        s += 6;
        if (s > 6) { s = 0; y++; }
      }
      break;
    }
    case 'ANUAL': {
      while (utc(y, 0, 1) <= fin && salida.length < MAX_VENTANAS) {
        agregar(utc(y, 0, 1), utc(y, 12, 0), `${y}`, `año ${y}`);
        y++;
      }
      break;
    }
    case 'QUINCENAL': {
      while (utc(y, m, 1) <= fin && salida.length < MAX_VENTANAS) {
        const ultimo = utc(y, m + 1, 0).getUTCDate();
        agregar(utc(y, m, 1), utc(y, m, 15), `1–15 ${MESES[m]}`, `primera quincena de ${MESES_LARGOS[m]} de ${y}`);
        agregar(utc(y, m, 16), utc(y, m, ultimo), `16–${ultimo} ${MESES[m]}`, `segunda quincena de ${MESES_LARGOS[m]} de ${y}`);
        if (++m > 11) { m = 0; y++; }
      }
      break;
    }
    case 'SEMANAL': {
      // Semanas de lunes a domingo.
      const c = new Date(desde);
      c.setUTCDate(c.getUTCDate() - ((c.getUTCDay() + 6) % 7));
      while (c <= fin && salida.length < MAX_VENTANAS) {
        const f = new Date(c);
        f.setUTCDate(f.getUTCDate() + 6);
        agregar(new Date(c), f, `${dd(c)}/${mm(c)}–${dd(f)}/${mm(f)}`,
          `semana del ${dd(c)}/${mm(c)} al ${dd(f)}/${mm(f)} de ${f.getUTCFullYear()}`);
        c.setUTCDate(c.getUTCDate() + 7);
      }
      break;
    }
    case 'DIARIO': {
      const c = new Date(desde);
      while (c <= fin && salida.length < MAX_VENTANAS) {
        agregar(new Date(c), new Date(c), String(c.getUTCDate()), `${dd(c)}/${mm(c)}/${c.getUTCFullYear()}`);
        c.setUTCDate(c.getUTCDate() + 1);
      }
      break;
    }
    default: {
      // MENSUAL
      while (utc(y, m, 1) <= fin && salida.length < MAX_VENTANAS) {
        agregar(utc(y, m, 1), utc(y, m + 1, 0), `${MESES[m]} ${y}`, `${MESES_LARGOS[m]} de ${y}`);
        if (++m > 11) { m = 0; y++; }
      }
    }
  }
  return salida;
}

/** Cumplida si hay algún registro dentro de la ventana; si no, según la fecha de hoy. */
export function estadoVentana(
  ventana: Ventana,
  fechasRegistradas: string[],
  hoy: string,
): EstadoVentana {
  if (fechasRegistradas.some((f) => f >= ventana.ini && f <= ventana.fin)) return 'CUMPLIDA';
  if (ventana.fin < hoy) return 'VENCIDA';
  if (ventana.ini <= hoy) return 'EN_CURSO';
  return 'PROGRAMADA';
}
