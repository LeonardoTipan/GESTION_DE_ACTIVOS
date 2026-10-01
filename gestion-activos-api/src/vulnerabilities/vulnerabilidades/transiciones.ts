import type { EstadoVulnerabilidad } from '../../generated/prisma/enums.js';

export type AccionVulnerabilidad =
  'iniciar-mitigacion' | 'mitigar' | 'aceptar-riesgo';

/**
 * Ciclo de vida de una vulnerabilidad: desde qué estados se permite cada
 * acción y a qué estado lleva. MITIGADA y ACEPTADA son finales.
 *
 *   ABIERTA ──iniciar-mitigacion──► EN_MITIGACION ──mitigar──► MITIGADA
 *      │                                  │
 *      └──────────aceptar-riesgo──────────┴───────────────────► ACEPTADA
 */
export const TRANSICIONES: Record<
  AccionVulnerabilidad,
  { desde: EstadoVulnerabilidad[]; hacia: EstadoVulnerabilidad }
> = {
  'iniciar-mitigacion': { desde: ['ABIERTA'], hacia: 'EN_MITIGACION' },
  mitigar: { desde: ['EN_MITIGACION'], hacia: 'MITIGADA' },
  'aceptar-riesgo': {
    desde: ['ABIERTA', 'EN_MITIGACION'],
    hacia: 'ACEPTADA',
  },
};

/** Estados en los que la vulnerabilidad sigue pendiente de resolver. */
export const ESTADOS_ABIERTOS: EstadoVulnerabilidad[] = [
  'ABIERTA',
  'EN_MITIGACION',
];

export function puedeTransicionar(
  estado: EstadoVulnerabilidad,
  accion: AccionVulnerabilidad,
): boolean {
  return TRANSICIONES[accion].desde.includes(estado);
}

/** Sigue abierta y ya pasó su fecha límite (SLA incumplido). */
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
