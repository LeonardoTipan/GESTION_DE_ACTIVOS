import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

/** Valor de un campo de catálogo: texto, o un interruptor (sí / no). */
export type ValorCatalogo = string | boolean

/**
 * Describe un catálogo editable (categorías, criticidades...) para que una
 * misma tabla y un mismo formulario sirvan para todos.
 */
export interface ConfigCatalogo<
  TFila extends { id: number },
  TDatos extends Record<string, ValorCatalogo>,
> {
  /** "categoría", "nivel de criticidad"... */
  singular: string
  campos: {
    clave: keyof TDatos & keyof TFila & string
    etiqueta: string
    requerido: boolean
    multilinea?: boolean
    /** 'interruptor' = sí / no (por defecto, texto). */
    tipo?: 'texto' | 'interruptor'
    /** Ayuda bajo el campo en el formulario. */
    descripcion?: string
  }[]
  useLista: () => UseQueryResult<TFila[], Error>
  useGuardar: () => UseMutationResult<TFila, Error, { id?: number; datos: TDatos }>
  useEliminar: () => UseMutationResult<unknown, Error, number>
}
