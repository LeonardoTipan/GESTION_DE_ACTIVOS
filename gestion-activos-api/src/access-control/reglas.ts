import type { EstadoControlAcceso, TipoAcceso } from '../generated/prisma/enums.js';

/**
 * Reglas puras del Control de acceso: códigos, transiciones de estado, situación
 * respecto a la fecha deseada y diferencias que se auditan.
 */

/** CAL = acceso lógico, CAF = acceso físico. Un correlativo independiente por tipo. */
export const PREFIJO: Record<TipoAcceso, string> = { LOGICO: 'CAL', FISICO: 'CAF' };

/** CAL-001 … CAL-999, CAL-1000 (mínimo tres cifras; nunca se trunca). */
export const codigoDe = (tipo: TipoAcceso, correlativo: number): string =>
  `${PREFIJO[tipo]}-${String(correlativo).padStart(3, '0')}`;

/** Cambios de estado permitidos: el estado lo lleva el flujo, no la fecha deseada. */
export const TRANSICIONES = {
  /** En gestión o a la espera de atención. */
  pendiente: { desde: ['ABIERTO'], hacia: 'PENDIENTE' },
  /** Atendida: exige la resolución; la fecha de atención la pone el backend. */
  cerrar: { desde: ['ABIERTO', 'PENDIENTE'], hacia: 'CERRADO' },
  /** Solo admin, con motivo: vuelve a gestión. */
  reabrir: { desde: ['CERRADO'], hacia: 'PENDIENTE' },
} as const satisfies Record<string, { desde: readonly EstadoControlAcceso[]; hacia: EstadoControlAcceso }>;
export type AccionEstado = keyof typeof TRANSICIONES;

export function puedeTransitar(accion: AccionEstado, estado: EstadoControlAcceso): boolean {
  return (TRANSICIONES[accion].desde as readonly EstadoControlAcceso[]).includes(estado);
}

/**
 * Situación respecto a la fecha deseada, calculada aparte del estado (que no se
 * sobrescribe): ATENDIDA si está cerrada; si no, VENCIDA, PROXIMA (dentro de
 * HORAS_PROXIMA) o PROGRAMADA.
 */
export const SITUACIONES = ['PROGRAMADA', 'PROXIMA', 'VENCIDA', 'ATENDIDA'] as const;
export type Situacion = (typeof SITUACIONES)[number];
export const HORAS_PROXIMA = 48;

export function situacionDe(estado: EstadoControlAcceso, fechaAccesoDeseada: Date, ahora = new Date()): Situacion {
  if (estado === 'CERRADO') return 'ATENDIDA';
  const t = fechaAccesoDeseada.getTime();
  if (t < ahora.getTime()) return 'VENCIDA';
  if (t <= ahora.getTime() + HORAS_PROXIMA * 3_600_000) return 'PROXIMA';
  return 'PROGRAMADA';
}

/** Campos que se auditan, en el orden en que se registran. */
export const CAMPOS_AUDITADOS = [
  'codigoUnico',
  'tipoAcceso',
  'activoId',
  'recurso',
  'fechaSolicitud',
  'fechaAccesoDeseada',
  'nombreUsuarioBeneficiario',
  'departamento',
  'tipoSolicitud',
  'descripcion',
  'estado',
  'resolucion',
  'fechaAtendido',
] as const;
export type CampoAuditado = (typeof CAMPOS_AUDITADOS)[number];
type Valor = string | number | Date | null | undefined;

/** Cómo se guarda un valor en el historial: fechas en ISO (UTC), el resto como texto. */
export const serializar = (v: Valor): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);

export interface Cambio {
  campo: CampoAuditado;
  valorAnterior: string | null;
  valorNuevo: string | null;
}

/** Diferencias entre dos estados de la solicitud (solo los campos auditados presentes en `despues`). */
export function cambiosAuditables(
  antes: Partial<Record<CampoAuditado, Valor>>,
  despues: Partial<Record<CampoAuditado, Valor>>,
): Cambio[] {
  const cambios: Cambio[] = [];
  for (const campo of CAMPOS_AUDITADOS) {
    if (!(campo in despues)) continue;
    const valorAnterior = serializar(antes[campo]);
    const valorNuevo = serializar(despues[campo]);
    if (valorAnterior !== valorNuevo) cambios.push({ campo, valorAnterior, valorNuevo });
  }
  return cambios;
}
