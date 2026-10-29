import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Módulos que filtran sus activos por la categoría (Catálogos > Categorías). El inventario
 * sigue siendo uno solo: la bandera solo decide qué activos ofrece cada módulo.
 */
export const APLICACIONES = ['MANTENIMIENTO', 'VULNERABILIDAD', 'RENOVACION', 'EVALUACION', 'ENDPOINT'] as const;
export type Aplicacion = (typeof APLICACIONES)[number];
/** Para ParseEnumPipe en los parámetros de consulta sueltos. */
export const ENUM_APLICACION = Object.fromEntries(APLICACIONES.map((a) => [a, a])) as Record<Aplicacion, Aplicacion>;

/** Bandera de la categoría que habilita cada módulo. */
export const CAMPO_APLICA = {
  MANTENIMIENTO: 'aplicaMantenimiento',
  VULNERABILIDAD: 'aplicaVulnerabilidad',
  RENOVACION: 'aplicaRenovacion',
  EVALUACION: 'aplicaEvaluacion',
  ENDPOINT: 'aplicaEndpoint',
} as const satisfies Record<Aplicacion, keyof Prisma.CategoriaWhereInput>;

/** Para los mensajes de error. */
export const NOMBRE_APLICACION: Record<Aplicacion, string> = {
  MANTENIMIENTO: 'Mantenimientos',
  VULNERABILIDAD: 'Vulnerabilidades',
  RENOVACION: 'Renovaciones',
  EVALUACION: 'Evaluación de Sistemas Productivos',
  ENDPOINT: 'Protección de Endpoints',
};

/** Activos cuya categoría está habilitada para el módulo. */
export function filtroAplica(aplica: Aplicacion): Prisma.ActivoWhereInput {
  return { categoria: { [CAMPO_APLICA[aplica]]: true } };
}
