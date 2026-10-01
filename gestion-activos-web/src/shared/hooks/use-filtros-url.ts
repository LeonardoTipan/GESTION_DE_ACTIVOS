import { useSearchParams } from 'react-router'

/**
 * Filtros de un listado guardados en la URL (?page=2&etapa=...): el enlace se
 * puede compartir y el botón "atrás" del navegador funciona.
 *
 * Cada módulo aporta cómo leer y escribir SUS filtros; este hook solo se
 * encarga de sincronizarlos con la URL.
 */
export function useFiltrosUrl<F extends { page: number }>(
  leer: (params: URLSearchParams) => F,
  escribir: (filtros: F) => URLSearchParams,
) {
  const [params, setParams] = useSearchParams()
  const filtros = leer(params)

  const actualizar = (cambios: Partial<F>) =>
    // Cambiar de página crea una entrada en el historial; cambiar filtros la reemplaza.
    setParams(escribir({ ...filtros, ...cambios }), {
      replace: cambios.page === undefined || cambios.page === 1,
    })

  const limpiar = () => setParams(new URLSearchParams())

  return { filtros, actualizar, limpiar }
}

/** Lee un entero positivo de la URL (ignora valores manipulados). */
export function enteroPositivo(valor: string | null): number | undefined {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** Lee un valor de la URL solo si pertenece a la lista permitida. */
export function valorPermitido<T extends string>(
  valor: string | null,
  permitidos: readonly T[],
): T | undefined {
  return permitidos.includes(valor as T) ? (valor as T) : undefined
}
