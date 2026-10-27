import type { Pendientes } from './api.ts'

/** Ruta del menú → módulo del resumen de pendientes. */
const POR_RUTA: Record<string, Exclude<keyof Pendientes, 'total'>> = {
  '/control-acceso': 'accesos',
  '/mantenimientos': 'mantenimientos',
  '/vulnerabilidades': 'vulnerabilidades',
  '/renovaciones': 'renovaciones',
}

/**
 * Pendientes del módulo de esa ruta, o null si la ruta no tiene trámites o el
 * resumen no está disponible (cargando o con error: nunca se muestra 0 en su lugar).
 */
export function pendientesDe(ruta: string, datos: Pendientes | undefined): number | null {
  const modulo = POR_RUTA[ruta]
  return modulo && datos ? datos[modulo] : null
}

export const textoPendientes = (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`)
