import type { BitacoraIndicadorDto, IndicadorExcelDto } from './dto.js';
import { periodosDelAnio, porcentajeBitacora, type PeriodoBitacora } from './periodos.js';

/** Cifras de un período: numerador, denominador y los datos informativos (por etiqueta). */
export interface CifrasPeriodo {
  numerador: number;
  denominador: number;
  informativas?: Record<string, number>;
}

/**
 * Arma la Bitácora General con el contrato común. `calcular` recibe cada período que ya
 * empezó (cerrado o en curso); los futuros quedan sin cifras (null), nunca en 0.
 * `informativas` fija el orden y la descripción de las filas informativas.
 */
export function construirBitacora(args: {
  anio: number;
  indicador: IndicadorExcelDto;
  calcular: (p: PeriodoBitacora) => CifrasPeriodo;
  informativas?: { etiqueta: string; descripcion?: string }[];
  ahora?: Date;
  zona?: string;
}): BitacoraIndicadorDto {
  const periodos = periodosDelAnio(args.anio, args.indicador.frecuencia, args.ahora, args.zona);
  const cifras = periodos.map((p) => (p.situacion === 'FUTURO' ? null : args.calcular(p)));
  return {
    indicador: args.indicador,
    anio: args.anio,
    periodos: periodos.map((p, i) => {
      const c = cifras[i];
      return {
        ...p,
        numerador: c?.numerador ?? null,
        denominador: c?.denominador ?? null,
        porcentaje: c ? porcentajeBitacora(c.numerador, c.denominador) : null,
      };
    }),
    informativas: (args.informativas ?? []).map((f) => ({
      etiqueta: f.etiqueta,
      descripcion: f.descripcion ?? null,
      valores: cifras.map((c) => (c ? (c.informativas?.[f.etiqueta] ?? 0) : null)),
    })),
  };
}

/** Indicadores del Excel, con su texto literal (nombre, evidencia, fórmula y frecuencia). */
export const INDICADORES_EXCEL = {
  respaldos: {
    nombre: 'Ejecución de respaldo y restauración',
    evidencia: 'Informe o acta de evidencia de restauración',
    formula: 'Respaldo de seguridad validados / Total programados',
    frecuencia: 'MENSUAL',
    numerador: 'Respaldo de seguridad validados',
    denominador: 'Total programados',
  },
  controlAcceso: {
    nombre: 'Índice de control de acceso',
    evidencia: 'Evidencia sitra/correo de acceso a servicio, sistemas, aplicaciones, centro de datos.',
    formula: 'Accesos otorgados / Total solicitudes formales',
    frecuencia: 'MENSUAL',
    numerador: 'Accesos otorgados',
    denominador: 'Total solicitudes formales',
  },
  mantenimientos: {
    nombre: 'Ejecución del plan de mantenimiento tecnológico',
    evidencia: 'Actas / informe de mantenimiento aprobado.',
    formula: 'Mantenimientos ejecutados en la infraestructura tecnológica / Total Planificados',
    frecuencia: 'SEMESTRAL',
    numerador: 'Mantenimientos ejecutados en la infraestructura tecnológica',
    denominador: 'Total Planificados',
  },
  vulnerabilidades: {
    nombre: 'Tasa de remediación de vulnerabilidades de seguridad',
    evidencia: 'Informe de vulnerabilidades remediadas aprobado',
    formula: 'Vulnerabilidades remediadas / Total Identificados',
    frecuencia: 'TRIMESTRAL',
    numerador: 'Vulnerabilidades remediadas',
    denominador: 'Total Identificados',
  },
  endpoints: {
    nombre: 'Cobertura de protección endpoint y antivirus institucional',
    evidencia: 'Inventario de equipos con agente instalado y actualizado',
    formula: 'Equipos con antivirus activo / Total activos',
    frecuencia: 'MENSUAL',
    numerador: 'Equipos con antivirus activo',
    denominador: 'Total activos',
  },
  evaluacion: {
    nombre: 'Nivel de evaluación de seguridad en aplicaciones y sistemas productivos',
    evidencia: 'Informe de pruebas de seguridad aprobado de sistemas en producción e inventario de sistemas y aplicaciones web producción.',
    formula: 'Pruebas de seguridad ejecutadas (sistemas productivos) / Total sistemas en producción',
    frecuencia: 'SEMESTRAL',
    numerador: 'Pruebas de seguridad ejecutadas (sistemas productivos)',
    denominador: 'Total sistemas en producción',
  },
} as const satisfies Record<string, Omit<IndicadorExcelDto, 'criterio'>>;
