import type { Activo } from '../api/activos.ts'

/** Claves especiales del filtro por estado (las mismas que la API). */
export const ESTADO_BAJA = '@baja'
export const ESTADO_SIN_ESTADO = '@sin-estado'

/** Etiqueta con la que se muestra un equipo dado de baja. */
export const ETIQUETA_BAJA = 'Dado de baja'

export interface EstadoActivo {
  /** Lo que se muestra en la columna Estado. */
  etiqueta: string | null
  /** true = dado de baja (a mano, en la papelera de GLPI o ya inexistente allí). */
  baja: boolean
  /** Por qué se dio de baja, en palabras. */
  motivo: string | null
  /** Desde cuándo (ISO). */
  desde: string | null
}

const MOTIVO: Record<string, string> = {
  PAPELERA_GLPI: 'Está en la papelera de GLPI',
  AUSENTE_EN_GLPI: 'Ya no existe en GLPI',
}

/**
 * El estado que se muestra de un activo. Si está dado de baja se muestra
 * "Dado de baja"; si no, el estado tal como lo informa GLPI (Bueno, Regular,
 * Malo…). La baja la registra la aplicación por separado (baja manual o
 * detección de la sincronización); el estado de GLPI describe la condición.
 */
export function estadoDe(
  activo: Pick<Activo, 'estado' | 'deletedAt' | 'inactivoDesde' | 'motivoInactivo'>,
): EstadoActivo {
  if (activo.deletedAt) {
    return { etiqueta: ETIQUETA_BAJA, baja: true, motivo: 'Dado de baja en la aplicación', desde: activo.deletedAt }
  }
  if (activo.inactivoDesde) {
    return {
      etiqueta: ETIQUETA_BAJA,
      baja: true,
      motivo: MOTIVO[activo.motivoInactivo ?? ''] ?? 'Detectado por la sincronización con GLPI',
      desde: activo.inactivoDesde,
    }
  }
  const estado = activo.estado?.trim()
  return { etiqueta: estado || null, baja: false, motivo: null, desde: null }
}
