import {
  calcularCambios,
  type Cambios,
} from '../inventory/bitacora/cambios.js';
import type { ActivoGlpi } from './mapeo.js';

/** Autor con el que el proceso firma el historial de los activos. */
export const RESPONSABLE_GLPI = 'GLPI';

/** Lo que necesitamos saber del activo local para decidir. */
export interface ActivoLocal {
  id: number;
  codigo: string;
  nombre: string;
  sistemas: string;
  custodio: string;
  ubicacion: string;
  cifrado: boolean;
  deletedAt: Date | null;
  /** Ya tiene entradas de historial firmadas por GLPI (sincronizado antes). */
  enlazadoConGlpi: boolean;
}

export type Accion =
  /** No existe en local: se da de alta. */
  | 'CREAR'
  /** Existía (registrado a mano) con el mismo código: se enlaza, sin duplicar. */
  | 'ENLAZAR'
  /** Ya enlazado y GLPI trae cambios. */
  | 'ACTUALIZAR'
  | 'SIN_CAMBIOS'
  /** No se toca (p. ej. dado de baja en local, o código repetido en GLPI). */
  | 'OMITIR';

export interface Plan {
  accion: Accion;
  /** Diferencias local → GLPI: { campo: { antes, despues } }. */
  diferencias: Cambios;
  motivo?: string;
}

/**
 * Decide qué hacer con un elemento de GLPI frente a su activo local (el que
 * comparte código de inventario), sin tocar la base. Función pura.
 */
export function planificar(glpi: ActivoGlpi, local: ActivoLocal | null): Plan {
  if (!local) {
    return { accion: 'CREAR', diferencias: {} };
  }
  if (local.deletedAt) {
    return {
      accion: 'OMITIR',
      diferencias: {},
      motivo: `El activo ${local.codigo} está dado de baja en local; no se reactiva automáticamente.`,
    };
  }
  const diferencias = calcularCambios(local, glpi.datos);
  if (!local.enlazadoConGlpi) {
    return {
      accion: 'ENLAZAR',
      diferencias,
      motivo: 'Registrado manualmente con el mismo código: se enlaza sin duplicar.',
    };
  }
  return Object.keys(diferencias).length === 0
    ? { accion: 'SIN_CAMBIOS', diferencias }
    : { accion: 'ACTUALIZAR', diferencias };
}
