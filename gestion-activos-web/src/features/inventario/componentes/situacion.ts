import type { Activo } from '../api/activos.ts'

/** Los tres filtros del inventario. */
export const SITUACIONES = ['todos', 'activos', 'no_activos'] as const
export type FiltroSituacion = (typeof SITUACIONES)[number]

export interface Situacion {
  /** Solo los equipos activos admiten respaldos, mantenimientos y vulnerabilidades nuevos. */
  activo: boolean
  etiqueta: 'Activo' | 'No activo'
  /** Por qué no está activo, en palabras. */
  motivo: string | null
  /** Desde cuándo (ISO). */
  desde: string | null
}

const MOTIVO: Record<string, string> = {
  PAPELERA_GLPI: 'Está en la papelera de GLPI',
  AUSENTE_EN_GLPI: 'Ya no existe en GLPI',
}

/**
 * Activo / No activo. Un equipo deja de estar activo si se dio de baja en la
 * aplicación o si la sincronización detectó que está en la papelera de GLPI o
 * que ya no existe allí. El estado de GLPI (Malo, Regular, Bueno) describe su
 * condición y NO interviene.
 */
export function situacionDe(
  activo: Pick<Activo, 'deletedAt' | 'inactivoDesde' | 'motivoInactivo'>,
): Situacion {
  if (activo.deletedAt) {
    return {
      activo: false,
      etiqueta: 'No activo',
      motivo: 'Dado de baja en la aplicación',
      desde: activo.deletedAt,
    }
  }
  if (activo.inactivoDesde) {
    return {
      activo: false,
      etiqueta: 'No activo',
      motivo: MOTIVO[activo.motivoInactivo ?? ''] ?? 'Marcado por la sincronización con GLPI',
      desde: activo.inactivoDesde,
    }
  }
  return { activo: true, etiqueta: 'Activo', motivo: null, desde: null }
}
