import { BadRequestException } from '@nestjs/common';
import { exigirRepositorioValido } from '../../common/evidencia/repositorio.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const MARGEN_FUTURO_MS = 5 * 60_000;

/**
 * Fecha REAL de remediación: la indica el usuario (puede ser histórica), no puede
 * ser futura ni anterior a la detección. No hay excepción aprobada para lo segundo.
 */
export function exigirFechaRemediacion(deteccion: Date, remediacion: Date | null | undefined, ahora = new Date()): void {
  if (!remediacion) return;
  if (remediacion.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) {
    throw new BadRequestException('La fecha de remediación no puede ser futura.');
  }
  if (remediacion < deteccion) {
    throw new BadRequestException('La fecha de remediación no puede ser anterior a la fecha de detección.');
  }
}

/** Inicio real del trabajo (opcional): no futuro ni anterior a la detección. */
export function exigirInicio(deteccion: Date, inicio: Date | null | undefined): void {
  if (inicio && inicio < deteccion) {
    throw new BadRequestException('El inicio de la remediación no puede ser anterior a la fecha de detección.');
  }
}

/**
 * Para pasar a REMEDIADO: fecha real de remediación válida, verificable y repositorio
 * (la evidencia se comprueba aquí, dentro de Remediación; no hay fase de verificación).
 */
export function exigirCierre(
  deteccion: Date,
  d: { fechaRemediacion?: Date | null; evidencia?: string | null; repositorioVerificable?: string | null },
  ahora = new Date(),
): void {
  const faltan = [
    !d.fechaRemediacion && 'la fecha de remediación',
    !d.evidencia?.trim() && 'el verificable',
    !d.repositorioVerificable?.trim() && 'el repositorio del verificable',
  ].filter(Boolean);
  if (faltan.length) {
    throw new BadRequestException(`Para remediar falta ${faltan.join(', ')}.`);
  }
  exigirFechaRemediacion(deteccion, d.fechaRemediacion, ahora);
  exigirRepositorioValido(d.repositorioVerificable);
}
