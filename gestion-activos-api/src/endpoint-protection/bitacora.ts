import { construirBitacora, INDICADORES_EXCEL, type CifrasPeriodo } from '../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../common/bitacora/dto.js';

/**
 * Bitácora General MENSUAL de Protección de Endpoints (un período por mes):
 *   Total activos: los equipos del período CERRADO del mes, es decir, la fotografía del inventario
 *     que se tomó al abrirlo (líneas sin duplicados); en los períodos anteriores sin detalle, el
 *     total registrado a mano.
 *   Equipos con antivirus activo: de ellos, los marcados con antivirus.
 * Un período abierto o en progreso todavía no es una medición: el mes queda sin cifras (N/D) y sus
 * equipos por registrar se informan aparte. Los anulados no cuentan. Función pura.
 */

export interface PeriodoEndpointBitacora {
  mes: number;
  estado: string;
  totalActivos: number | null;
  equiposConAntivirus: number | null;
  lineas: { conAntivirus: boolean | null }[];
}

export const CRITERIO_ENDPOINTS =
  'Total activos: los equipos del período CERRADO del mes, copiados del inventario al abrirlo (sin duplicados); en los ' +
  'períodos anteriores sin detalle por equipo, el total registrado. Equipos con antivirus activo: de ellos, los marcados con ' +
  'antivirus. Un período sin cerrar no cuenta como medición. Sin anulados.';

export const INFORMATIVAS_ENDPOINTS = [
  { etiqueta: 'Equipos sin antivirus', descripcion: 'Total activos − equipos con antivirus del período cerrado.' },
  { etiqueta: 'Equipos por registrar (período sin cerrar)', descripcion: 'Equipos del período abierto o en progreso que aún no tienen su marca de antivirus.' },
];

/** Totales de un período: del detalle por equipo si lo tiene; si no, los registrados. */
export function totalesPeriodo(p: PeriodoEndpointBitacora): { total: number; conAntivirus: number } {
  if (p.lineas.length) return { total: p.lineas.length, conAntivirus: p.lineas.filter((l) => l.conAntivirus === true).length };
  return { total: p.totalActivos ?? 0, conAntivirus: p.equiposConAntivirus ?? 0 };
}

export function bitacoraEndpoints(anio: number, periodos: PeriodoEndpointBitacora[], ahora = new Date(), zona?: string): BitacoraIndicadorDto {
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.endpoints, criterio: CRITERIO_ENDPOINTS },
    informativas: INFORMATIVAS_ENDPOINTS,
    calcular: (periodo): CifrasPeriodo => {
      const mes = Number(periodo.clave.slice(5, 7));
      const p = periodos.find((x) => x.mes === mes);
      if (!p) return { numerador: 0, denominador: 0 };
      if (p.estado !== 'CERRADO') {
        return { numerador: 0, denominador: 0, informativas: { 'Equipos por registrar (período sin cerrar)': p.lineas.filter((l) => l.conAntivirus === null).length } };
      }
      const t = totalesPeriodo(p);
      return { numerador: t.conAntivirus, denominador: t.total, informativas: { 'Equipos sin antivirus': t.total - t.conAntivirus } };
    },
  });
}
