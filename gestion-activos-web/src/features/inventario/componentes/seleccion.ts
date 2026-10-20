/** Niveles de criticidad que cuentan como críticos (igual que CRITICIDADES_CRITICAS de la API por defecto). */
export const CRITICIDADES_CRITICAS = ['Alta', 'Crítica']

/** Valor del desplegable para "todas": cadena vacía (no hay categoría con id 0). */
export const TODAS_LAS_CATEGORIAS = ''

/** Opciones del desplegable: primero "Todas", después las categorías reales con su recuento. */
export function opcionesCategoria(
  categorias: { categoriaId: number; nombre: string; total: number }[],
): { value: string; label: string }[] {
  return [
    { value: TODAS_LAS_CATEGORIAS, label: 'Todas las categorías' },
    ...categorias.map((c) => ({ value: String(c.categoriaId), label: `${c.nombre} (${c.total})` })),
  ]
}

/** Marca o desmarca un activo. En selección única, marcar uno sustituye al anterior. */
export function alternar(seleccion: number[], id: number, marcado: boolean, multiple = true): number[] {
  if (!marcado) return seleccion.filter((x) => x !== id)
  if (!multiple) return [id]
  return seleccion.includes(id) ? seleccion : [...seleccion, id]
}

/** Añade varios sin repetir y sin perder lo ya elegido. */
export function agregar(seleccion: number[], ids: number[]): number[] {
  return [...new Set([...seleccion, ...ids])]
}
