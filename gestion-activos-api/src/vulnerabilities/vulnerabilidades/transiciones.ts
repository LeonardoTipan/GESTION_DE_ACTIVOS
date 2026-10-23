import type { EstadoVulnerabilidad } from '../../generated/prisma/enums.js';

export type AccionVulnerabilidad = 'iniciar' | 'remediar' | 'reabrir';

/**
 * Dos fases sobre el MISMO registro: Detección (se registra ABIERTO) y Remediación.
 * No hay fase de verificación: la evidencia se exige al remediar.
 *
 *   ABIERTO ──iniciar──► EN_PROGRESO ──remediar──► REMEDIADO
 *      └──────────────remediar──────────────────────┘    │
 *                        ▲                                │
 *                        └────────────reabrir─────────────┘
 *
 * Remediar desde ABIERTO cubre lo que se corrigió antes de registrarlo.
 */
export const TRANSICIONES: Record<
  AccionVulnerabilidad,
  { desde: EstadoVulnerabilidad[]; hacia: EstadoVulnerabilidad }
> = {
  iniciar: { desde: ['ABIERTO'], hacia: 'EN_PROGRESO' },
  remediar: { desde: ['ABIERTO', 'EN_PROGRESO'], hacia: 'REMEDIADO' },
  reabrir: { desde: ['REMEDIADO'], hacia: 'EN_PROGRESO' },
};

/** Estados en los que la vulnerabilidad sigue pendiente de remediar. */
export const ESTADOS_ABIERTOS: EstadoVulnerabilidad[] = ['ABIERTO', 'EN_PROGRESO'];

export function puedeTransicionar(
  estado: EstadoVulnerabilidad,
  accion: AccionVulnerabilidad,
): boolean {
  return TRANSICIONES[accion].desde.includes(estado);
}

/** Sigue pendiente y ya pasó su fecha límite (plazo incumplido). */
export function estaVencida(
  vulnerabilidad: {
    estado: EstadoVulnerabilidad;
    fechaLimite: Date | null;
  },
  ahora = new Date(),
): boolean {
  return (
    vulnerabilidad.fechaLimite !== null &&
    vulnerabilidad.fechaLimite < ahora &&
    ESTADOS_ABIERTOS.includes(vulnerabilidad.estado)
  );
}
