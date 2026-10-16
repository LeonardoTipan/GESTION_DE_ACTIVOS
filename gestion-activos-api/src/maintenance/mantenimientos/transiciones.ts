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

/**
 * Hasta cuándo debía completarse: su fecha límite prevista. Los registros
 * anteriores a los plazos no la tienen: para ellos cuenta la fecha programada
 * mientras no se haya iniciado.
 */
export function limiteEfectivo(m: { fase: FaseMantenimiento; fecha: Date; fechaLimite?: Date | null }): Date | null {
  if (m.fechaLimite) return m.fechaLimite;
  return m.fase === 'PROGRAMADO' ? m.fecha : null;
}

/** Sin completar (programado o en ejecución) y con el límite ya pasado. */
export function estaVencido(
  mantenimiento: { fase: FaseMantenimiento; fecha: Date; fechaLimite?: Date | null },
  ahora = new Date(),
): boolean {
  const limite = limiteEfectivo(mantenimiento);
  return (mantenimiento.fase === 'PROGRAMADO' || mantenimiento.fase === 'EN_EJECUCION') && !!limite && limite < ahora;
}
