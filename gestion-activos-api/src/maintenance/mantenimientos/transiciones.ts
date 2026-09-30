import type { FaseMantenimiento } from '../../generated/prisma/enums.js';

export type AccionMantenimiento = 'iniciar' | 'finalizar' | 'cancelar';

/**
 * Máquina de estados del mantenimiento: desde qué fases se permite cada
 * acción y a qué fase lleva.
 *
 *   PROGRAMADO ──iniciar──► EN_EJECUCION ──finalizar──► FINALIZADO
 *        │                        │
 *        └────────cancelar────────┴──────────────────► CANCELADO
 */
export const TRANSICIONES: Record<
  AccionMantenimiento,
  { desde: FaseMantenimiento[]; hacia: FaseMantenimiento }
> = {
  iniciar: { desde: ['PROGRAMADO'], hacia: 'EN_EJECUCION' },
  finalizar: { desde: ['EN_EJECUCION'], hacia: 'FINALIZADO' },
  cancelar: { desde: ['PROGRAMADO', 'EN_EJECUCION'], hacia: 'CANCELADO' },
};

export function puedeTransicionar(
  fase: FaseMantenimiento,
  accion: AccionMantenimiento,
): boolean {
  return TRANSICIONES[accion].desde.includes(fase);
}

/** Programado y con fecha ya pasada: el frontend lo marca como vencido. */
export function estaVencido(
  mantenimiento: { fase: FaseMantenimiento; fecha: Date },
  ahora = new Date(),
): boolean {
  return mantenimiento.fase === 'PROGRAMADO' && mantenimiento.fecha < ahora;
}
