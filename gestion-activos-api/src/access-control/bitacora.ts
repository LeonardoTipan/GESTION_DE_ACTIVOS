import { construirBitacora, INDICADORES_EXCEL } from '../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../common/bitacora/dto.js';

/**
 * Bitácora General MENSUAL de Control de acceso (decisión del 06/11/2026):
 *   Total solicitudes formales: solicitudes de ALTA (tipo ACCESO) con la fecha de solicitud en el mes.
 *   Accesos otorgados: de ellas, las CERRADAS (atendidas, con fecha real de atención).
 * Las BAJAS son otro flujo operativo: se informan aparte y no entran en la fórmula. Una solicitud
 * del mes que se atiende después sube el cumplimiento de SU mes (el de la solicitud).
 * Limitación conocida: el módulo no distingue una solicitud denegada (se cierra igual). Función pura.
 */

export interface SolicitudBitacora {
  fechaSolicitud: Date;
  tipoSolicitud: string;
  estado: string;
}

export type EnIndicadorAcceso = 'OTORGADO' | 'PENDIENTE' | 'NO_APLICA';

export const CRITERIO_CONTROL_ACCESO =
  'Total solicitudes formales: solicitudes de ALTA de acceso (lógico o físico) con la fecha de solicitud en el mes. ' +
  'Accesos otorgados: de ellas, las CERRADAS con su fecha real de atención. Las solicitudes de BAJA se informan aparte. ' +
  'Una solicitud cerrada se cuenta como otorgada: el módulo no registra denegaciones por separado.';

export const enIndicadorAcceso = (s: { tipoSolicitud: string; estado: string }): EnIndicadorAcceso =>
  s.tipoSolicitud !== 'ACCESO' ? 'NO_APLICA' : s.estado === 'CERRADO' ? 'OTORGADO' : 'PENDIENTE';

export const INFORMATIVAS_CONTROL_ACCESO = [
  { etiqueta: 'Altas pendientes de atender', descripcion: 'Solicitudes de alta del mes abiertas o en gestión.' },
  { etiqueta: 'Solicitudes de baja', descripcion: 'Solicitudes de retiro de acceso registradas en el mes (otro flujo: no entran en la fórmula).' },
  { etiqueta: 'Bajas atendidas', descripcion: 'De ellas, las cerradas.' },
];

export function bitacoraControlAcceso(anio: number, solicitudes: SolicitudBitacora[], ahora = new Date(), zona?: string): BitacoraIndicadorDto {
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.controlAcceso, criterio: CRITERIO_CONTROL_ACCESO },
    informativas: INFORMATIVAS_CONTROL_ACCESO,
    calcular: ({ desde, hasta }) => {
      const delMes = solicitudes.filter((s) => s.fechaSolicitud >= desde && s.fechaSolicitud < hasta);
      const altas = delMes.filter((s) => s.tipoSolicitud === 'ACCESO');
      const bajas = delMes.filter((s) => s.tipoSolicitud !== 'ACCESO');
      const otorgadas = altas.filter((s) => s.estado === 'CERRADO').length;
      return {
        numerador: otorgadas,
        denominador: altas.length,
        informativas: {
          'Altas pendientes de atender': altas.length - otorgadas,
          'Solicitudes de baja': bajas.length,
          'Bajas atendidas': bajas.filter((s) => s.estado === 'CERRADO').length,
        },
      };
    },
  });
}
