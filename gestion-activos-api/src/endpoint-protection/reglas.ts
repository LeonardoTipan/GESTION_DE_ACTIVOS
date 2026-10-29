import { BadRequestException } from '@nestjs/common';
import { exigirRepositorioValido } from '../common/evidencia/repositorio.js';

/**
 * Reglas puras de la fase 2 de Protección de Endpoints (registro y cierre del mes).
 * Los totales los digita el técnico según el inventario real del mes: el número de
 * equipos que ve la aplicación es solo una referencia y nunca bloquea el cierre.
 */

export interface DatosRegistroPeriodo {
  totalActivos: number | null;
  equiposConAntivirus: number | null;
  evidencia: string | null;
  repositorioVerificable: string | null;
}

/** Cobertura = equipos con antivirus ÷ total × 100, con 1 decimal. Sin ambos datos (o total 0), null. */
export function cobertura(totalActivos: number | null, equiposConAntivirus: number | null): number | null {
  if (totalActivos === null || equiposConAntivirus === null || totalActivos <= 0) return null;
  return Math.round((equiposConAntivirus / totalActivos) * 1000) / 10;
}

/** Equipos sin antivirus = total − con antivirus (null si falta alguno). */
export function equiposSinAntivirus(totalActivos: number | null, equiposConAntivirus: number | null): number | null {
  return totalActivos === null || equiposConAntivirus === null ? null : totalActivos - equiposConAntivirus;
}

/** Coherencia de lo guardado (también sin cerrar): total ≥ 1, con antivirus ≤ total, repositorio válido. */
export function exigirCoherencia(d: DatosRegistroPeriodo): void {
  if (d.totalActivos !== null && d.totalActivos < 1) {
    throw new BadRequestException('El total de activos debe ser al menos 1.');
  }
  if (d.totalActivos !== null && d.equiposConAntivirus !== null && d.equiposConAntivirus > d.totalActivos) {
    throw new BadRequestException(
      `Los equipos con antivirus (${d.equiposConAntivirus}) no pueden superar el total de activos (${d.totalActivos}).`,
    );
  }
  exigirRepositorioValido(d.repositorioVerificable);
}

/** Cerrar exige los dos totales, el verificable y su repositorio. El mensaje dice qué falta. */
export function exigirCierre(d: DatosRegistroPeriodo): void {
  const faltan = [
    d.totalActivos === null && 'el total de activos',
    d.equiposConAntivirus === null && 'los equipos con antivirus activo',
    !d.evidencia?.trim() && 'el verificable (inventario de equipos)',
    !d.repositorioVerificable?.trim() && 'el repositorio del verificable',
  ].filter(Boolean);
  if (faltan.length) throw new BadRequestException(`Para cerrar el período falta: ${faltan.join(', ')}.`);
  exigirCoherencia(d);
}
