import { BadRequestException } from '@nestjs/common';
import { exigirRepositorioValido } from '../common/evidencia/repositorio.js';
import { diaLocal } from '../common/plazos/plazos.js';
import type { EstadoRenovacion } from '../generated/prisma/enums.js';

/**
 * Reglas puras de Renovaciones: vigencia del elemento, coherencia de fechas y
 * requisitos de cierre. Las fechas son DÍAS (columnas DATE): se comparan como
 * 'AAAA-MM-DD'; «hoy» es el día en la hora de la institución.
 */

const MS_DIA = 86_400_000;

/** Días antes de la caducidad en que un elemento pasa a «próximo a caducar». */
export function diasAviso(): number {
  const n = Number(process.env.RENOVACIONES_DIAS_AVISO);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 30;
}

/** Un DATE de la base ('2026-04-27T00:00:00Z') como día 'AAAA-MM-DD'. */
export const dia = (d: Date): string => d.toISOString().slice(0, 10);

/** Un día 'AAAA-MM-DD' como instante a medianoche UTC (así se guarda en DATE). */
export const fechaDia = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

/** Hoy, en la hora de la institución. */
export const hoy = (ahora = new Date()): string => diaLocal(ahora);

export type Vigencia = 'VIGENTE' | 'PROXIMA' | 'CADUCADA' | 'SIN_CADUCIDAD' | 'SUSTITUIDA';

export interface DatosVigencia {
  estado: EstadoRenovacion;
  fechaCaducidadActual: Date | null;
  sinCaducidadActual: boolean;
  nuevaFechaCaducidad: Date | null;
  nuevaSinCaducidad: boolean;
  /** Hay una renovación posterior (no anulada) del mismo elemento. */
  sustituida: boolean;
}

/**
 * Hasta cuándo vale el elemento HOY según esta renovación: antes de cerrarla, la
 * caducidad actual; cerrada, la nueva. null = sin caducidad (o sustituida).
 */
export function venceEl(v: Omit<DatosVigencia, 'sustituida'>): Date | null {
  if (v.estado === 'CERRADO') return v.nuevaSinCaducidad ? null : v.nuevaFechaCaducidad;
  return v.sinCaducidadActual ? null : v.fechaCaducidadActual;
}

/**
 * Vigencia del ELEMENTO (licencia, garantía…), separada del estado del PROCESO:
 * una renovación puede estar ABIERTA con la licencia todavía vigente. Caduca al
 * terminar su último día: el mismo día de la caducidad sigue vigente.
 */
export function vigencia(v: DatosVigencia, ahora = new Date(), aviso = diasAviso()): { vigencia: Vigencia; diasRestantes: number | null } {
  if (v.sustituida) return { vigencia: 'SUSTITUIDA', diasRestantes: null };
  const vence = venceEl(v);
  if (!vence) return { vigencia: 'SIN_CADUCIDAD', diasRestantes: null };
  const restantes = Math.round((vence.getTime() - fechaDia(hoy(ahora)).getTime()) / MS_DIA);
  const tipo: Vigencia = restantes < 0 ? 'CADUCADA' : restantes <= aviso ? 'PROXIMA' : 'VIGENTE';
  return { vigencia: tipo, diasRestantes: restantes };
}

/** Planificación: la caducidad actual es obligatoria salvo marca explícita, que exige justificarla. */
export function exigirCaducidadActual(d: { fechaCaducidadActual?: Date | null; sinCaducidadActual?: boolean; observacion?: string | null }): void {
  if (d.sinCaducidadActual) {
    if (d.fechaCaducidadActual) {
      throw new BadRequestException('Indicó «sin caducidad»: no registre también una fecha de caducidad actual.');
    }
    if (!d.observacion?.trim()) {
      throw new BadRequestException('Justifique en la observación por qué el elemento no tiene caducidad conocida o aplicable.');
    }
    return;
  }
  if (!d.fechaCaducidadActual) {
    throw new BadRequestException('Indique la fecha de caducidad actual, o marque «sin caducidad conocida o aplicable» y justifíquelo.');
  }
}

/** La fecha REAL de renovación la indica el usuario: puede ser histórica, no futura. */
export function exigirFechaRenovacion(fecha: Date | null | undefined, ahora = new Date()): void {
  if (fecha && dia(fecha) > hoy(ahora)) {
    throw new BadRequestException('La fecha real de renovación no puede ser futura.');
  }
}

export interface DatosCierre {
  fechaCaducidadActual: Date | null;
  fechaRenovacion?: Date | null;
  nuevaFechaCaducidad?: Date | null;
  nuevaSinCaducidad?: boolean;
  evidencia?: string | null;
  repositorioVerificable?: string | null;
  observacion?: string | null;
}

/** Lo que falta para cerrar (para el mensaje: qué campo falta). */
export function faltantesCierre(d: DatosCierre): string[] {
  return [
    !d.fechaRenovacion && 'la fecha real de renovación',
    !d.nuevaSinCaducidad && !d.nuevaFechaCaducidad && 'la nueva fecha de caducidad (o marcar «sin caducidad»)',
    !d.evidencia?.trim() && 'el verificable',
    !d.repositorioVerificable?.trim() && 'el repositorio del verificable',
    d.nuevaSinCaducidad && !d.observacion?.trim() && 'la justificación de «sin caducidad» en la observación',
  ].filter((x): x is string => Boolean(x));
}

/**
 * Coherencia de lo ejecutado (al guardar y al cerrar): renovación no futura; la
 * nueva caducidad, posterior a la renovación y a la caducidad anterior; no se
 * marca «sin caducidad» y a la vez una fecha; repositorio válido.
 */
export function exigirCoherencia(d: DatosCierre, ahora = new Date()): void {
  exigirFechaRenovacion(d.fechaRenovacion, ahora);
  if (d.nuevaSinCaducidad && d.nuevaFechaCaducidad) {
    throw new BadRequestException('Indicó que la nueva vigencia no tiene caducidad: no registre también una nueva fecha de caducidad.');
  }
  if (d.nuevaFechaCaducidad && d.fechaRenovacion && dia(d.nuevaFechaCaducidad) <= dia(d.fechaRenovacion)) {
    throw new BadRequestException('La nueva fecha de caducidad debe ser posterior a la fecha real de renovación.');
  }
  if (d.nuevaFechaCaducidad && d.fechaCaducidadActual && dia(d.nuevaFechaCaducidad) <= dia(d.fechaCaducidadActual)) {
    throw new BadRequestException('La nueva fecha de caducidad debe ser posterior a la caducidad actual: una renovación amplía la vigencia.');
  }
  exigirRepositorioValido(d.repositorioVerificable);
}

/** Para pasar a CERRADO: todo lo obligatorio y coherente. No basta con haber escrito una fecha. */
export function exigirCierre(d: DatosCierre, ahora = new Date()): void {
  const faltan = faltantesCierre(d);
  if (faltan.length) throw new BadRequestException(`Para cerrar la renovación falta ${faltan.join(', ')}.`);
  exigirCoherencia(d, ahora);
}
