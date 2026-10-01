import type { Etapa, Respaldo } from './api/respaldos.ts'

/** Etiqueta y color de cada etapa (la calcula la API a partir de los dos estados). */
export const INFO_ETAPA: Record<Etapa, { etiqueta: string; color: string }> = {
  PENDIENTE_EJECUCION: { etiqueta: 'Pendiente de ejecución', color: 'gray' },
  EJECUCION_FALLIDA: { etiqueta: 'Ejecución fallida', color: 'red' },
  PENDIENTE_PRUEBA: { etiqueta: 'Pendiente de prueba', color: 'yellow' },
  PRUEBA_FALLIDA: { etiqueta: 'Prueba fallida', color: 'orange' },
  COMPLETADO: { etiqueta: 'Completado', color: 'green' },
}

export const ETAPAS = Object.keys(INFO_ETAPA) as Etapa[]

export type EstadoPaso = 'completado' | 'fallido' | 'pendiente' | 'bloqueado'

/**
 * Estado de cada uno de los 3 pasos del Stepper: alcance, ejecución y prueba.
 * La prueba queda bloqueada mientras la ejecución no sea EXITOSA (regla de la API).
 */
export function estadoPasos(
  respaldo: Pick<Respaldo, 'estadoEjecucion' | 'estadoPrueba'>,
): [EstadoPaso, EstadoPaso, EstadoPaso] {
  const ejecucion: EstadoPaso =
    respaldo.estadoEjecucion === 'EXITOSA'
      ? 'completado'
      : respaldo.estadoEjecucion === 'FALLIDA'
        ? 'fallido'
        : 'pendiente'
  const prueba: EstadoPaso =
    ejecucion !== 'completado'
      ? 'bloqueado'
      : respaldo.estadoPrueba === 'APROBADA'
        ? 'completado'
        : respaldo.estadoPrueba === 'FALLIDA'
          ? 'fallido'
          : 'pendiente'
  return ['completado', ejecucion, prueba]
}

/** Paso "activo" del Stepper: el primero que no está completado (3 = todos). */
export function pasoActivo(pasos: readonly EstadoPaso[]): number {
  const i = pasos.findIndex((p) => p !== 'completado')
  return i === -1 ? pasos.length : i
}
