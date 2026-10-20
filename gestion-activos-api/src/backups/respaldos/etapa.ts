import type { Prisma } from '../../generated/prisma/client.js';
import type {
  EstadoEjecucion,
  EstadoPrueba,
} from '../../generated/prisma/enums.js';

/**
 * Etapa del ciclo de vida de un respaldo, derivada de sus dos estados.
 * Es lo que el frontend muestra como etiqueta y usa para filtrar.
 */
export const ETAPAS_RESPALDO = [
  'PENDIENTE_EJECUCION',
  'EJECUCION_FALLIDA',
  'PENDIENTE_PRUEBA',
  'PRUEBA_FALLIDA',
  'COMPLETADO',
] as const;
export type EtapaRespaldo = (typeof ETAPAS_RESPALDO)[number];

export function calcularEtapa(respaldo: {
  estadoEjecucion: EstadoEjecucion;
  estadoPrueba: EstadoPrueba;
}): EtapaRespaldo {
  if (respaldo.estadoEjecucion === 'PENDIENTE') return 'PENDIENTE_EJECUCION';
  if (respaldo.estadoEjecucion === 'FALLIDA') return 'EJECUCION_FALLIDA';
  if (respaldo.estadoPrueba === 'PENDIENTE') return 'PENDIENTE_PRUEBA';
  if (respaldo.estadoPrueba === 'FALLIDA') return 'PRUEBA_FALLIDA';
  return 'COMPLETADO';
}

/** La misma regla, expresada como filtro de base de datos (?etapa=...). */
export const WHERE_POR_ETAPA: Record<EtapaRespaldo, Prisma.RespaldoWhereInput> =
  {
    PENDIENTE_EJECUCION: { estadoEjecucion: 'PENDIENTE' },
    EJECUCION_FALLIDA: { estadoEjecucion: 'FALLIDA' },
    PENDIENTE_PRUEBA: { estadoEjecucion: 'EXITOSA', estadoPrueba: 'PENDIENTE' },
    PRUEBA_FALLIDA: { estadoEjecucion: 'EXITOSA', estadoPrueba: 'FALLIDA' },
    COMPLETADO: { estadoEjecucion: 'EXITOSA', estadoPrueba: 'APROBADA' },
  };
