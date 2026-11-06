import { construirBitacora, INDICADORES_EXCEL } from '../../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../../common/bitacora/dto.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Bitácora General TRIMESTRAL de Vulnerabilidades (decisión del 06/11/2026, opción A):
 *   Denominador · «Total identificados»: las vulnerabilidades PENDIENTES en algún momento del
 *     trimestre: detectadas antes de su fin y no remediadas antes de su inicio (arrastra lo
 *     pendiente de trimestres anteriores).
 *   Numerador · «Vulnerabilidades remediadas»: de ellas, las REMEDIADAS con la fecha REAL de
 *     remediación dentro del trimestre.
 * Solo vigentes: las anuladas no llegan aquí. Una reabierta vuelve a contar como pendiente
 * (su remediación anterior queda en la auditoría). Funciones puras.
 */

export interface VulnerabilidadBitacora {
  fecha: Date;
  estado: string;
  fechaLimite: Date | null;
  fechaRemediacion: Date | null;
}

export const CRITERIO_VULNERABILIDADES =
  'Total identificados: vulnerabilidades vigentes (no anuladas) pendientes en algún momento del trimestre, es decir, ' +
  'detectadas antes de su fin y no remediadas antes de su inicio (incluye lo pendiente de trimestres anteriores). ' +
  'Remediadas: de ellas, las que están REMEDIADAS con la fecha real de remediación dentro del trimestre.';

const remediadaAntes = (v: VulnerabilidadBitacora, instante: Date) =>
  v.estado === 'REMEDIADO' && v.fechaRemediacion !== null && v.fechaRemediacion < instante;

/** ¿Forma parte del denominador del período [desde, hasta)? */
export const pendienteEnPeriodo = (v: VulnerabilidadBitacora, desde: Date, hasta: Date): boolean =>
  v.fecha < hasta && !remediadaAntes(v, desde);

/** ¿Forma parte del numerador del período [desde, hasta)? */
export const remediadaEnPeriodo = (v: VulnerabilidadBitacora, desde: Date, hasta: Date): boolean =>
  pendienteEnPeriodo(v, desde, hasta) && remediadaAntes(v, hasta);

/** El mismo criterio del denominador como filtro de Prisma (para la Bitácora Específica). */
export const wherePendienteEnPeriodo = (desde: Date, hasta: Date): Prisma.VulnerabilidadWhereInput => ({
  fecha: { lt: hasta },
  NOT: { estado: 'REMEDIADO', fechaRemediacion: { lt: desde } },
});

export const INFORMATIVAS_VULNERABILIDADES = [
  { etiqueta: 'Detectadas en el trimestre', descripcion: 'Con la fecha de detección dentro del trimestre (parte del total identificado).' },
  { etiqueta: 'Pendientes al cierre', descripcion: 'Total identificados − remediadas.' },
  { etiqueta: 'Remediadas fuera de plazo', descripcion: 'Remediadas en el trimestre después de su fecha límite.' },
];

export function bitacoraVulnerabilidades(anio: number, vulnerabilidades: VulnerabilidadBitacora[], ahora = new Date(), zona?: string): BitacoraIndicadorDto {
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.vulnerabilidades, criterio: CRITERIO_VULNERABILIDADES },
    informativas: INFORMATIVAS_VULNERABILIDADES,
    calcular: ({ desde, hasta }) => {
      const identificadas = vulnerabilidades.filter((v) => pendienteEnPeriodo(v, desde, hasta));
      const remediadas = identificadas.filter((v) => remediadaAntes(v, hasta));
      return {
        numerador: remediadas.length,
        denominador: identificadas.length,
        informativas: {
          'Detectadas en el trimestre': identificadas.filter((v) => v.fecha >= desde).length,
          'Pendientes al cierre': identificadas.length - remediadas.length,
          'Remediadas fuera de plazo': remediadas.filter((v) => v.fechaLimite && v.fechaRemediacion! > v.fechaLimite).length,
        },
      };
    },
  });
}
