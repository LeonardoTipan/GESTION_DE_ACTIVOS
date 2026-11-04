import { BadRequestException } from '@nestjs/common';
import { exigirRepositorioValido } from '../common/evidencia/repositorio.js';
import { instanteLocal, zonaHoraria } from '../common/plazos/plazos.js';

/**
 * Reglas puras de la fase 2 de Protección de Endpoints (registro y cierre del mes).
 * Los totales los digita el técnico según el inventario real del mes: el número de
 * equipos que ve la aplicación es solo una referencia y nunca bloquea el cierre.
 * La aplicación no detecta el antivirus de cada equipo (no hay integración que lo
 * informe): el dato viene del inventario del mes (el verificable).
 */

/** Margen para el reloj del equipo: una fecha real no puede ser futura (mismo criterio que los demás módulos). */
const MARGEN_FUTURO_MS = 5 * 60_000;

export interface DatosRegistroPeriodo {
  totalActivos: number | null;
  equiposConAntivirus: number | null;
  fechaEjecucion: Date | null;
  responsableEjecucion: string | null;
  evidencia: string | null;
  repositorioVerificable: string | null;
}

/** El mes del período (año y mes) al que pertenece la medición. */
export interface MesPeriodo {
  anio: number;
  mes: number;
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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Búsqueda libre por año y/o mes: «2026», «oct», «octubre de 2026», «10». Devuelve null si algún
 * término no es un año ni un mes (ningún período coincide). «a» son abril y agosto.
 */
export function interpretarBusqueda(q: string): { anio?: number; meses?: number[] } | null {
  const resultado: { anio?: number; meses?: number[] } = {};
  for (const termino of q.toLowerCase().split(/\s+/).filter((t) => t && t !== 'de')) {
    if (/^\d{4}$/.test(termino)) {
      resultado.anio = Number(termino);
    } else if (/^\d{1,2}$/.test(termino) && Number(termino) >= 1 && Number(termino) <= 12) {
      resultado.meses = [Number(termino)];
    } else {
      const meses = MESES.flatMap((m, i) => (m.startsWith(termino) ? [i + 1] : []));
      if (!meses.length) return null;
      resultado.meses = meses;
    }
  }
  return resultado;
}

/** Primer instante del mes del período en la hora de la institución. */
export const inicioDelMes = (p: MesPeriodo, zona = zonaHoraria()): Date =>
  instanteLocal(`${p.anio}-${String(p.mes).padStart(2, '0')}-01`, 0, zona);

/**
 * Coherencia de lo guardado (también sin cerrar): total ≥ 1, con antivirus ≤ total, fecha real
 * de la medición no futura ni anterior al mes del período, repositorio válido.
 */
export function exigirCoherencia(d: DatosRegistroPeriodo, periodo: MesPeriodo, ahora = new Date()): void {
  if (d.totalActivos !== null && d.totalActivos < 1) {
    throw new BadRequestException('El total de activos debe ser al menos 1.');
  }
  if (d.totalActivos !== null && d.equiposConAntivirus !== null && d.equiposConAntivirus > d.totalActivos) {
    throw new BadRequestException(
      `Los equipos con antivirus (${d.equiposConAntivirus}) no pueden superar el total de activos (${d.totalActivos}).`,
    );
  }
  if (d.fechaEjecucion) {
    if (d.fechaEjecucion.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) {
      throw new BadRequestException('La fecha real de la medición no puede ser futura.');
    }
    if (d.fechaEjecucion < inicioDelMes(periodo)) {
      throw new BadRequestException('La fecha real de la medición no puede ser anterior al mes del período.');
    }
  }
  exigirRepositorioValido(d.repositorioVerificable);
}

/**
 * Cerrar exige los dos totales, la fecha real y el responsable de la medición, el verificable
 * (inventario de equipos) y su repositorio. El mensaje dice qué falta.
 */
export function exigirCierre(d: DatosRegistroPeriodo, periodo: MesPeriodo, ahora = new Date()): void {
  const faltan = [
    d.totalActivos === null && 'el total de activos',
    d.equiposConAntivirus === null && 'los equipos con antivirus activo',
    !d.fechaEjecucion && 'la fecha real de la medición',
    !d.responsableEjecucion?.trim() && 'el responsable de la medición',
    !d.evidencia?.trim() && 'el verificable (inventario de equipos)',
    !d.repositorioVerificable?.trim() && 'el repositorio del verificable',
  ].filter(Boolean);
  if (faltan.length) throw new BadRequestException(`Para cerrar el período falta: ${faltan.join(', ')}.`);
  exigirCoherencia(d, periodo, ahora);
}
