import type { FiltrosApiActivos } from './activos.ts'

/**
 * Claves de caché de TanStack Query del inventario. Están anidadas a propósito:
 * invalidar ['inventario', 'activos'] refresca listados, fichas y bitácoras.
 */
export const claves = {
  categorias: ['inventario', 'categorias'] as const,
  criticidades: ['inventario', 'criticidades'] as const,
  activos: ['inventario', 'activos'] as const,
  listaActivos: (filtros: FiltrosApiActivos) =>
    ['inventario', 'activos', 'lista', filtros] as const,
  activo: (id: number) => ['inventario', 'activos', 'detalle', id] as const,
  bitacora: (id: number, page: number) =>
    ['inventario', 'activos', 'bitacora', id, page] as const,
}
