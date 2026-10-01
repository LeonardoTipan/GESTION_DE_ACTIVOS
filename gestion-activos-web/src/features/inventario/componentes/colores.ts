/** "Crítica" → "critica": sin tildes ni mayúsculas, para comparar niveles. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const COLOR_POR_NIVEL: Record<string, string> = {
  baja: 'green',
  media: 'yellow',
  alta: 'orange',
  critica: 'red',
}

/**
 * Color de Mantine para un nivel de criticidad. Los niveles son un catálogo
 * editable: si el admin crea uno nuevo, se muestra en gris en vez de fallar.
 */
export function colorCriticidad(nivel: string): string {
  return COLOR_POR_NIVEL[normalizar(nivel)] ?? 'gray'
}
