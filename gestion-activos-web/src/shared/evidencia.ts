/**
 * Repositorio del verificable: una carpeta o ruta (sin esquema, también C:\…) o una
 * URL http(s). Misma regla que la API (mantenimiento y vulnerabilidades); null = válido.
 */
export function errorRepositorio(valor: string): string | null {
  const v = valor.trim()
  if (v.length > 191) return 'Máximo 191 caracteres'
  if (!v || !/^[a-z][a-z0-9+.-]+:/i.test(v)) return null
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Solo URL http o https, o una carpeta compartida'
  } catch {
    return 'No es una URL válida'
  }
}
