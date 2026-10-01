import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

/**
 * Describe un catálogo editable (categorías, criticidades...) para que una
 * misma tabla y un mismo formulario sirvan para todos.
 */
export interface ConfigCatalogo<
  TFila extends { id: number },
  TDatos extends Record<string, string>,
> {
  /** "categoría", "nivel de criticidad"... */
  singular: string
  campos: {
    clave: keyof TDatos & keyof TFila & string
    etiqueta: string
    requerido: boolean
    multilinea?: boolean
  }[]
  useLista: () => UseQueryResult<TFila[], Error>
  useGuardar: () => UseMutationResult<TFila, Error, { id?: number; datos: TDatos }>
  useEliminar: () => UseMutationResult<unknown, Error, number>
}
