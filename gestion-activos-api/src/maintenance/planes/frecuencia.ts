/** Frecuencias de un plan de mantenimiento (las del enum de la base). */
export type FrecuenciaMantenimiento = 'UNICA' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

const MESES: Record<Exclude<FrecuenciaMantenimiento, 'UNICA'>, number> = {
  MENSUAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

/**
 * Fecha de la intervención siguiente a `fecha`. null si el plan es de una
 * sola vez. Si el día no existe en el mes destino (31 de febrero), se usa el
 * último día de ese mes. Función pura.
 */
export function siguienteFecha(fecha: Date, frecuencia: FrecuenciaMantenimiento): Date | null {
  if (frecuencia === 'UNICA') return null;
  const meses = MESES[frecuencia];
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(fecha.getUTCDate(), ultimoDia),
      fecha.getUTCHours(),
      fecha.getUTCMinutes(),
      fecha.getUTCSeconds(),
    ),
  );
}

/** Estado de cierre de un mantenimiento según su última verificación vigente. */
export type CierreMantenimiento =
  | 'NO_APLICA'
  | 'PENDIENTE_VERIFICACION'
  | 'CERRADO'
  | 'EN_SEGUIMIENTO'
  | 'NO_SATISFACTORIO';

export function cierreDe(
  fase: string,
  verificaciones: { resultado: string; anuladoEn: Date | null }[],
): CierreMantenimiento {
  if (fase !== 'FINALIZADO') return 'NO_APLICA';
  const ultima = verificaciones.filter((v) => !v.anuladoEn).at(-1);
  if (!ultima) return 'PENDIENTE_VERIFICACION';
  if (ultima.resultado === 'OPERATIVO') return 'CERRADO';
  if (ultima.resultado === 'REQUIERE_SEGUIMIENTO') return 'EN_SEGUIMIENTO';
  return 'NO_SATISFACTORIO';
}
