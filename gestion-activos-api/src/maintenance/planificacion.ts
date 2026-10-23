import { BadRequestException } from '@nestjs/common';
import { diaLocal, instanteLocal, zonaHoraria } from '../common/plazos/plazos.js';
import type { ClaseMantenimiento, TipoMantenimiento } from '../generated/prisma/enums.js';

/**
 * Reglas puras de la Planificación y la Ejecución del mantenimiento: tipos según
 * la clase del activo y semestre/año de una fecha (en la hora de la institución).
 */

// ── Tipos de mantenimiento por clase ────────────────────────────────────────

export const TIPOS_HARDWARE: readonly TipoMantenimiento[] = ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'];
export const TIPOS_SOFTWARE: readonly TipoMantenimiento[] = ['PREVENTIVO', 'CORRECTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO'];
/** Sin clase (categoría sin clasificar en Catálogos): solo los comunes a ambas. */
export const TIPOS_COMUNES: readonly TipoMantenimiento[] = ['PREVENTIVO', 'CORRECTIVO'];

export function tiposPermitidos(clase: ClaseMantenimiento | null): readonly TipoMantenimiento[] {
  return clase === 'HARDWARE' ? TIPOS_HARDWARE : clase === 'SOFTWARE' ? TIPOS_SOFTWARE : TIPOS_COMUNES;
}

const NOMBRE_CLASE: Record<ClaseMantenimiento, string> = { HARDWARE: 'hardware', SOFTWARE: 'software' };

/** 400 si el tipo no corresponde a la clase del activo (por la categoría, no por su nombre). */
export function exigirTipoPermitido(
  tipo: TipoMantenimiento,
  activo: { codigo: string; categoria: { nombre: string; claseMantenimiento: ClaseMantenimiento | null } },
): void {
  const clase = activo.categoria.claseMantenimiento;
  if (tiposPermitidos(clase).includes(tipo)) return;
  throw new BadRequestException(
    clase
      ? `El tipo ${tipo} no corresponde a ${NOMBRE_CLASE[clase]} (${activo.codigo}, ${activo.categoria.nombre}): ` +
          `use ${tiposPermitidos(clase).join(', ')}.`
      : `La categoría ${activo.categoria.nombre} de ${activo.codigo} no está clasificada como hardware ni software ` +
          '(Catálogos): solo admite PREVENTIVO o CORRECTIVO.',
  );
}

// ── Semestre y año ──────────────────────────────────────────────────────────

export type NumeroSemestre = 1 | 2;
export interface Semestre {
  anio: number;
  semestre: NumeroSemestre;
  /** «S1-2026» */
  etiqueta: string;
}

/**
 * Semestre de una fecha en la hora de la institución: S1 = enero–junio,
 * S2 = julio–diciembre. Un 30 de junio a las 22:00 en Guayaquil es S1 aunque en
 * UTC ya sea 1 de julio. Se calcula siempre de la fecha: no se guarda aparte.
 */
export function semestreDe(fecha: Date, zona = zonaHoraria()): Semestre {
  const [anio, mes] = diaLocal(fecha, zona).split('-').map(Number);
  const semestre: NumeroSemestre = mes <= 6 ? 1 : 2;
  return { anio, semestre, etiqueta: `S${semestre}-${anio}` };
}

/** [desde, hasta) del semestre (o del año entero), en instantes, según la hora de la institución. */
export function rangoDe(anio: number, semestre?: NumeroSemestre, zona = zonaHoraria()): { desde: Date; hasta: Date } {
  const mesInicio = semestre === 2 ? 7 : 1;
  const finAnio = semestre === 1 ? `${anio}-07-01` : `${anio + 1}-01-01`;
  return {
    desde: instanteLocal(`${anio}-${String(mesInicio).padStart(2, '0')}-01`, 0, zona),
    hasta: instanteLocal(finAnio, 0, zona),
  };
}

/**
 * Cumplimiento de un semestre: planificaciones con al menos una ejecución
 * completada sobre las que se esperaba ejecutar (sin las suspendidas). Sin
 * planificaciones esperables no hay porcentaje (null), nunca una división por cero.
 */
export function cumplimiento(conEjecucionCompletada: number, esperables: number): number | null {
  if (esperables <= 0) return null;
  return Math.round((conEjecucionCompletada / esperables) * 1000) / 10;
}

// ── Verificable ─────────────────────────────────────────────────────────────

/** Compartida con Vulnerabilidades: vive en common/evidencia. */
export { exigirRepositorioValido } from '../common/evidencia/repositorio.js';

// ── Fechas reales ───────────────────────────────────────────────────────────

/** Margen para el reloj del equipo: una fecha real no puede ser futura. */
const MARGEN_FUTURO_MS = 5 * 60_000;

/** Fechas REALES: las indica el usuario (no la hora del servidor); no futuras y fin ≥ inicio. */
export function exigirFechasReales(inicio: Date | null | undefined, fin: Date | null | undefined, ahora = new Date()): void {
  const limite = ahora.getTime() + MARGEN_FUTURO_MS;
  if (inicio && inicio.getTime() > limite) throw new BadRequestException('La fecha real de mantenimiento no puede ser futura.');
  if (fin && fin.getTime() > limite) throw new BadRequestException('La fecha real de finalización no puede ser futura.');
  if (inicio && fin && fin < inicio) {
    throw new BadRequestException('La fecha real de finalización no puede ser anterior a la fecha real de mantenimiento.');
  }
}
