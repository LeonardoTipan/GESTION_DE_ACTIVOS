// Funciones puras del módulo de respaldos (sin dependencias de la interfaz).

/** Folio legible del prototipo: PLN-0003, RES-0012, RST-0002. */
export const folio = (prefijo: 'PLN' | 'RES' | 'RST', id: number) =>
  `${prefijo}-${String(id).padStart(4, '0')}`

/** Fecha sugerida al pulsar una ventana: hoy, acotado a la ventana. */
export function fechaDeVentana(w: { ini: string; fin: string }, hoy: string): string {
  if (hoy < w.ini) return w.ini
  if (hoy > w.fin) return w.fin
  return hoy
}
