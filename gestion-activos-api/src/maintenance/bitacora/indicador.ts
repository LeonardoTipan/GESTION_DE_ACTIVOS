import { construirBitacora, INDICADORES_EXCEL } from '../../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../../common/bitacora/dto.js';
import type { ResumenSemestre } from './calculo.js';

/**
 * Bitácora General SEMESTRAL de Mantenimientos con el contrato común del Excel. NO cambia el
 * cálculo existente (calculo.ts, decisión del 06/11/2026: se mantiene):
 *   Total Planificados: planificaciones del semestre PLANIFICADO menos las suspendidas sin
 *     ejecución (no son exigibles: no penalizan el cumplimiento).
 *   Mantenimientos ejecutados: planificaciones con al menos una ejecución FINALIZADA (sin doble
 *     conteo). Un plan no es una ejecución.
 */
export const CRITERIO_MANTENIMIENTOS =
  'Total Planificados: planificaciones de mantenimiento con la fecha de inicio planificada en el semestre, sin anuladas y sin ' +
  'las suspendidas formalmente sin ejecución (no son exigibles). Mantenimientos ejecutados: de ellas, las que tienen al menos ' +
  'una ejecución FINALIZADA (varias ejecuciones de la misma planificación cuentan una vez), aunque se ejecuten en otro semestre.';

export const INFORMATIVAS_MANTENIMIENTOS = [
  { etiqueta: 'Planificadas (con suspendidas)', descripcion: 'Todas las planificaciones no anuladas del semestre planificado.' },
  { etiqueta: 'Suspendidas sin ejecución', descripcion: 'Suspendidas formalmente: se descuentan del total planificado.' },
  { etiqueta: 'Ejecuciones finalizadas (fecha real)', descripcion: 'Ejecuciones finalizadas cuya fecha real cae en el semestre, con o sin planificación.' },
  { etiqueta: 'De ellas, sin planificación', descripcion: 'Registros anteriores al plan de mantenimiento.' },
];

export function indicadorMantenimientos(anio: number, semestres: ResumenSemestre[], ahora = new Date(), zona?: string): BitacoraIndicadorDto {
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.mantenimientos, criterio: CRITERIO_MANTENIMIENTOS },
    informativas: INFORMATIVAS_MANTENIMIENTOS,
    calcular: (p) => {
      const r = semestres.find((s) => `${anio}-S${s.periodo.semestre}` === p.clave);
      if (!r) return { numerador: 0, denominador: 0 };
      return {
        numerador: r.cumplidas,
        denominador: r.esperadas,
        informativas: {
          'Planificadas (con suspendidas)': r.planificadas,
          'Suspendidas sin ejecución': r.suspendidas,
          'Ejecuciones finalizadas (fecha real)': r.ejecucionesCompletadas,
          'De ellas, sin planificación': r.ejecucionesSinPlanificacion,
        },
      };
    },
  });
}
