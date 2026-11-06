import { construirBitacora, INDICADORES_EXCEL } from '../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../common/bitacora/dto.js';

/**
 * Bitácora General SEMESTRAL de Evaluación de Sistemas Productivos con la fórmula del Excel
 * (decisión del 06/11/2026, opción A: sin migración):
 *   Total sistemas en producción: activos de las categorías marcadas para Evaluación que estaban
 *     en el inventario al CIERRE del semestre (o hoy, si está en curso): dados de alta antes del
 *     corte (fecha de alta en GLPI o, si no la hay, de registro) y sin baja ni inactivación
 *     anterior al corte. Se reconstruye con las fechas del inventario.
 *   Pruebas de seguridad ejecutadas: sistemas DISTINTOS de ese total con una evaluación CERRADA
 *     cuya fecha real de pruebas cae en el semestre (planificada o en progreso no cuenta).
 * Las anuladas no llegan aquí. Función pura.
 */

export interface SistemaProduccion {
  id: number;
  /** Alta en el inventario de origen (fechaAlta de GLPI) o, sin ella, la de registro local. */
  alta: Date;
  /** Primera de: baja manual o inactivación detectada por GLPI. null = sigue vigente. */
  baja: Date | null;
}

export interface EvaluacionIndicador {
  activoId: number;
  estado: string;
  fechaProgramadaProduccion: Date;
  fechaPruebas: Date | null;
}

export const CRITERIO_EVALUACION =
  'Total sistemas en producción: activos de las categorías marcadas para Evaluación (catálogo) que estaban en el inventario ' +
  'al cierre del semestre, o hoy si está en curso (alta anterior al corte y sin baja ni inactivación antes de él). Pruebas ' +
  'ejecutadas: sistemas distintos de ese total con una evaluación CERRADA cuyas pruebas reales son del semestre. Una ' +
  'evaluación planificada o en progreso no cuenta. Limitación: la categoría y el estado de GLPI se toman como están hoy.';

/** Sistemas en producción en el instante `corte`. */
export const enProduccion = (sistemas: SistemaProduccion[], corte: Date) =>
  sistemas.filter((s) => s.alta < corte && (s.baja === null || s.baja >= corte));

export const INFORMATIVAS_EVALUACION = [
  { etiqueta: 'Evaluaciones cerradas en el semestre', descripcion: 'Por la fecha real de las pruebas; un sistema evaluado dos veces cuenta una vez en la fórmula.' },
  { etiqueta: 'Evaluaciones planificadas en el semestre', descripcion: 'Por la fecha planificada de evaluación.' },
  { etiqueta: 'Planificadas sin ejecutar', descripcion: 'Planificadas en el semestre que siguen abiertas o en progreso.' },
  { etiqueta: 'Sistemas evaluados fuera del inventario de producción', descripcion: 'Evaluados en el semestre pero sin estar en producción al corte: no entran en la fórmula.' },
];

export function indicadorEvaluacion(
  anio: number,
  sistemas: SistemaProduccion[],
  evaluaciones: EvaluacionIndicador[],
  ahora = new Date(),
  zona?: string,
): BitacoraIndicadorDto {
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.evaluacion, criterio: CRITERIO_EVALUACION },
    informativas: INFORMATIVAS_EVALUACION,
    calcular: ({ desde, hasta }) => {
      const corte = hasta < ahora ? hasta : ahora;
      const universo = new Set(enProduccion(sistemas, corte).map((s) => s.id));
      const cerradas = evaluaciones.filter((e) => e.estado === 'CERRADO' && e.fechaPruebas && e.fechaPruebas >= desde && e.fechaPruebas < hasta);
      const evaluados = new Set(cerradas.map((e) => e.activoId));
      const planificadas = evaluaciones.filter((e) => e.fechaProgramadaProduccion >= desde && e.fechaProgramadaProduccion < hasta);
      return {
        numerador: [...evaluados].filter((id) => universo.has(id)).length,
        denominador: universo.size,
        informativas: {
          'Evaluaciones cerradas en el semestre': cerradas.length,
          'Evaluaciones planificadas en el semestre': planificadas.length,
          'Planificadas sin ejecutar': planificadas.filter((e) => e.estado !== 'CERRADO').length,
          'Sistemas evaluados fuera del inventario de producción': [...evaluados].filter((id) => !universo.has(id)).length,
        },
      };
    },
  });
}
