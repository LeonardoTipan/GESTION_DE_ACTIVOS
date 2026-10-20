/** Detalle de la bitácora: { campo: { antes, despues } }. */
export type Cambios = Record<string, { antes: unknown; despues: unknown }>;

/** Fechas a ISO para compararlas y guardarlas como texto legible. */
function normalizar(valor: unknown): unknown {
  return valor instanceof Date ? valor.toISOString() : valor;
}

/**
 * Compara el registro actual con los campos recibidos y devuelve solo los que
 * realmente cambian. Los campos no enviados (undefined) se ignoran.
 */
export function calcularCambios(actual: object, nuevos: object): Cambios {
  const antes = actual as Record<string, unknown>;
  const cambios: Cambios = {};
  for (const [campo, valor] of Object.entries(nuevos)) {
    if (valor === undefined) continue;
    const a = normalizar(antes[campo]);
    const d = normalizar(valor);
    if (a !== d) {
      cambios[campo] = { antes: a ?? null, despues: d };
    }
  }
  return cambios;
}

/** Para un alta: todos los campos pasan de null a su valor inicial. */
export function cambiosDeCreacion(campos: object): Cambios {
  return calcularCambios({}, campos);
}
