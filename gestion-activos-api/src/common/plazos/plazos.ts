import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';

/**
 * Plazos de los tres módulos: cada etapa tiene un intervalo PREVISTO
 * [inicio, límite] y una fecha REAL. Si la real cae fuera, no se corrige la
 * fecha ni el plan: se exige una excepción (solo admin, con justificación) y
 * queda registrada.
 */

export type Posicion = 'EN_PLAZO' | 'ANTES' | 'DESPUES' | 'SIN_PLAZO';

/** Dónde cae `real` respecto al intervalo previsto. Sin inicio ni límite, no hay plazo que cumplir. */
export function evaluarPlazo(real: Date, inicio?: Date | null, limite?: Date | null): Posicion {
  if (!inicio && !limite) return 'SIN_PLAZO';
  if (inicio && real < inicio) return 'ANTES';
  if (limite && real > limite) return 'DESPUES';
  return 'EN_PLAZO';
}

/** El límite nunca antes que el inicio. */
export function exigirIntervalo(inicio: Date | null | undefined, limite: Date | null | undefined, que: string): void {
  if (inicio && limite && limite < inicio) {
    throw new BadRequestException(`${que}: la fecha límite no puede ser anterior al inicio previsto.`);
  }
}

export const MOTIVO_EXCEPCION_MINIMO = 20;

export interface Excepcion {
  fueraDePlazo: boolean;
  motivoExcepcion: string | null;
  excepcionPor: string | null;
}

export const SIN_EXCEPCION: Excepcion = { fueraDePlazo: false, motivoExcepcion: null, excepcionPor: null };

const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/**
 * Comprueba la fecha real contra el intervalo previsto. En plazo (o sin plazo):
 * nada que registrar. Fuera: 409 con el motivo, salvo que un ADMIN la registre
 * como excepción con justificación; la fecha real se conserva tal cual.
 */
export function plazoOExcepcion(args: {
  real: Date;
  inicio?: Date | null;
  limite?: Date | null;
  que: string;
  motivoExcepcion?: string;
  usuario?: AuthUser;
}): Excepcion {
  const posicion = evaluarPlazo(args.real, args.inicio, args.limite);
  if (posicion === 'EN_PLAZO' || posicion === 'SIN_PLAZO') return SIN_EXCEPCION;
  const intervalo = `${args.inicio ? fmt(args.inicio) : '—'} → ${args.limite ? fmt(args.limite) : '—'}`;
  const detalle = `${args.que} fuera del intervalo previsto (${posicion === 'ANTES' ? 'antes del inicio' : 'después del límite'}: ${intervalo}).`;
  return exigirExcepcion(detalle, args.motivoExcepcion, args.usuario);
}

/**
 * Algo se sale de lo previsto (`detalle` dice qué): 409 sin justificación;
 * con ella, solo un admin la registra como excepción.
 */
export function exigirExcepcion(detalle: string, motivoExcepcion?: string, usuario?: AuthUser): Excepcion {
  const motivo = motivoExcepcion?.trim();
  if (!motivo) {
    throw new ConflictException(
      `${detalle} Un administrador puede registrarla como excepción con su justificación, o ampliar el plazo antes.`,
    );
  }
  if (!usuario?.roles.includes('admin')) {
    throw new ForbiddenException(`${detalle} Solo un administrador puede registrar excepciones de plazo.`);
  }
  if (motivo.length < MOTIVO_EXCEPCION_MINIMO) {
    throw new BadRequestException(`La justificación de la excepción necesita al menos ${MOTIVO_EXCEPCION_MINIMO} caracteres.`);
  }
  return { fueraDePlazo: true, motivoExcepcion: motivo, excepcionPor: usuario.username };
}

/** Desfase de la zona respecto a UTC en ese instante, en ms (Guayaquil: −5 h). */
function desfase(instante: number, zona: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instante)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instante / 1000) * 1000;
}

/** El instante de un día local "AAAA-MM-DD" a cierta hora local (minutos desde medianoche). */
export function instanteLocal(dia: string, minutos: number, zona = zonaHoraria()): Date {
  const [y, m, d] = dia.split('-').map(Number);
  const comoUtc = Date.UTC(y, m - 1, d, 0, minutos);
  return new Date(comoUtc - desfase(comoUtc, zona));
}

/** "AAAA-MM-DD" del día en la zona de la institución (un respaldo a las 22:30 es de ese día, no del siguiente en UTC). */
export function diaLocal(fecha: Date, zona = zonaHoraria()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

// ── Hora local ───────────────────────────────────────────────────────────────

/** Zona horaria de la institución (la misma de GLPI salvo que se indique otra). */
export const zonaHoraria = (): string => process.env.ZONA_HORARIA || process.env.GLPI_TIMEZONE || 'America/Guayaquil';

/** Día de la semana (0 = domingo) y minutos desde medianoche en la zona indicada. */
export function horaLocal(fecha: Date, zona = zonaHoraria()): { diaSemana: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (t: string) => partes.find((p) => p.type === t)?.value ?? '0';
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { diaSemana: dias.indexOf(valor('weekday')), minutos: Number(valor('hour')) * 60 + Number(valor('minute')) };
}
