import { diaLocal, horaLocal, instanteLocal, zonaHoraria } from '../../common/plazos/plazos.js';

/** Frecuencias de un plan de mantenimiento (las del enum de la base). */
export type FrecuenciaMantenimiento = 'UNICA' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

const MESES: Record<Exclude<FrecuenciaMantenimiento, 'UNICA'>, number> = {
  MENSUAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

/**
 * Fecha de la intervención siguiente a `fecha`, en la hora de la institución (Ecuador): se
 * suman meses de CALENDARIO LOCAL conservando la hora local, así que una fecha registrada de
 * noche no salta de día ni de mes por la conversión a UTC. Si el día no existe en el mes
 * destino (31 → febrero), se usa el último día de ese mes (29 en bisiesto). null si el plan
 * es de una sola vez. Función pura.
 */
export function siguienteFecha(fecha: Date, frecuencia: FrecuenciaMantenimiento, zona = zonaHoraria()): Date | null {
  if (frecuencia === 'UNICA') return null;
  const [anio, mes, dia] = diaLocal(fecha, zona).split('-').map(Number);
  const indice = anio * 12 + (mes - 1) + MESES[frecuencia];
  const anioDestino = Math.floor(indice / 12);
  const mesDestino = (indice % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  const destino = `${anioDestino}-${String(mesDestino).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
  // Hora y minuto locales, más los segundos y milisegundos tal cual (las zonas desplazan horas o
  // minutos enteros: los segundos son los mismos en UTC y en la hora local).
  return new Date(instanteLocal(destino, horaLocal(fecha, zona).minutos, zona).getTime() + (fecha.getTime() % 60_000));
}

/** Lo mínimo de una ejecución para decidir la próxima intervención del plan. */
export interface EjecucionParaProxima {
  fase: string;
  fechaFin: Date | null;
  anuladoEn: Date | null;
}

/**
 * Próxima intervención de un plan, DERIVADA de su historial (función pura):
 * - con alguna ejecución FINALIZADA (no anulada, con fin real): fin real de la ÚLTIMA + período;
 *   ÚNICA → null (no hay más intervenciones);
 * - sin ninguna finalizada: la fecha de inicio planificada (la primera intervención prevista).
 * Programar o cancelar no la cambian; corregir el fin real, anular o revertir sí (se recalcula).
 */
export function proximaIntervencion(
  plan: { fechaInicio: Date; frecuencia: FrecuenciaMantenimiento },
  ejecuciones: EjecucionParaProxima[],
  zona = zonaHoraria(),
): { proximaFecha: Date | null; ultimaFinalizacion: Date | null } {
  const finalizadas = ejecuciones
    .filter((e) => e.fase === 'FINALIZADO' && !e.anuladoEn && e.fechaFin)
    .map((e) => e.fechaFin!.getTime());
  if (!finalizadas.length) return { proximaFecha: plan.fechaInicio, ultimaFinalizacion: null };
  const ultima = new Date(Math.max(...finalizadas));
  return { proximaFecha: siguienteFecha(ultima, plan.frecuencia, zona), ultimaFinalizacion: ultima };
}
