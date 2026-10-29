import { BadRequestException } from '@nestjs/common';
import { exigirRepositorioValido } from '../common/evidencia/repositorio.js';
import type { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';

/**
 * Reglas puras de la fase 2 de Evaluación de Sistemas Productivos (ejecución y cierre).
 * Las pruebas posteriores a la fecha programada de paso a producción se PERMITEN, pero el
 * cierre exige justificarlas en la observación: así queda la trazabilidad sin forzar a
 * nadie a registrar una fecha que no es la real.
 */

/** Margen para el reloj del equipo: una fecha real no puede ser futura (mismo criterio que Mantenimientos). */
const MARGEN_FUTURO_MS = 5 * 60_000;
/** Longitud mínima de la justificación de unas pruebas tardías (como los motivos de la auditoría). */
export const JUSTIFICACION_MINIMA = 20;

export type Situacion = 'PENDIENTE' | 'VENCIDA' | 'CUMPLIDA' | 'CUMPLIDA_TARDE';
export const SITUACIONES: readonly Situacion[] = ['PENDIENTE', 'VENCIDA', 'CUMPLIDA', 'CUMPLIDA_TARDE'];

export interface DatosEjecucionEvaluacion {
  fechaProgramadaProduccion: Date;
  fechaPruebas: Date | null;
  evidencia: string | null;
  repositorioVerificable: string | null;
  observacion: string | null;
}

/** Las pruebas fueron posteriores a la fecha programada de paso a producción. */
export const esTardia = (fechaPruebas: Date | null, programada: Date): boolean =>
  fechaPruebas !== null && fechaPruebas.getTime() > programada.getTime();

/** Situación para la bitácora: pendiente o vencida (sin cerrar), cumplida a tiempo o tarde (cerrada). */
export function situacion(
  e: { estado: EstadoEvaluacionSistema; fechaProgramadaProduccion: Date; fechaPruebas: Date | null },
  ahora = new Date(),
): Situacion {
  if (e.estado === 'CERRADO') return esTardia(e.fechaPruebas, e.fechaProgramadaProduccion) ? 'CUMPLIDA_TARDE' : 'CUMPLIDA';
  return e.fechaProgramadaProduccion.getTime() < ahora.getTime() ? 'VENCIDA' : 'PENDIENTE';
}

/** Coherencia de lo guardado (también sin cerrar): la fecha real no es futura y el repositorio es válido. */
export function exigirCoherencia(d: DatosEjecucionEvaluacion, ahora = new Date()): void {
  if (d.fechaPruebas && d.fechaPruebas.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) {
    throw new BadRequestException('La fecha real de las pruebas de seguridad no puede ser futura.');
  }
  exigirRepositorioValido(d.repositorioVerificable);
}

/**
 * Cerrar exige la fecha real de las pruebas, el informe (verificable) y su repositorio; si las
 * pruebas fueron posteriores a la fecha programada, además la justificación en la observación.
 */
export function exigirCierre(d: DatosEjecucionEvaluacion, ahora = new Date()): void {
  const faltan = [
    !d.fechaPruebas && 'la fecha real de las pruebas de seguridad',
    !d.evidencia?.trim() && 'el verificable (informe de las pruebas)',
    !d.repositorioVerificable?.trim() && 'el repositorio del verificable',
  ].filter(Boolean);
  if (faltan.length) throw new BadRequestException(`Para cerrar la evaluación falta: ${faltan.join(', ')}.`);
  exigirCoherencia(d, ahora);
  if (esTardia(d.fechaPruebas, d.fechaProgramadaProduccion) && (d.observacion?.trim().length ?? 0) < JUSTIFICACION_MINIMA) {
    throw new BadRequestException(
      `Las pruebas fueron posteriores a la fecha programada de paso a producción: justifíquelo en la observación (al menos ${JUSTIFICACION_MINIMA} caracteres).`,
    );
  }
}
