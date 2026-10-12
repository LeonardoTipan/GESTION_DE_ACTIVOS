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
  /** Elemento de GLPI del que procede ("Computer #12"); null si se registró a mano. */
  origenGlpi: string | null;
  nombre: string;
  sistemas: string;
  custodio: string;
  ubicacion: string;
  cifrado: boolean;
  numeroSerie: string | null;
  estado: string | null;
  fabricante: string | null;
  comentario: string | null;
  tipo: string | null;
  modelo: string | null;
  tecnicoResponsable: string | null;
  red: string | null;
  contacto: string | null;
  fechaAlta: Date | null;
  deletedAt: Date | null;
}

export type Accion =
  /** No existe en local: se da de alta. */
  | 'CREAR'
  /** Existía (registrado a mano) con el mismo código: se enlaza, sin duplicar. */
  | 'ENLAZAR'
  /** Ya enlazado y GLPI trae cambios. */
  | 'ACTUALIZAR'
  | 'SIN_CAMBIOS'
  /** No se toca (p. ej. dado de baja en local). */
  | 'OMITIR';

export interface Plan {
  accion: Accion;
  /** Código del activo: el que ya tiene o el que tendrá al crearse. */
  codigo: string;
  /** Diferencias local → GLPI: { campo: { antes, despues } }. */
  diferencias: Cambios;
  motivo?: string;
  /** Constancia de decisiones sobre el código (p. ej. n.º de inventario repetido). */
  avisos: string[];
}

/** Lo que se sabe del entorno al decidir sobre un elemento de GLPI. */
export interface Contexto {
  /** Activo local ya enlazado a ESTE elemento de GLPI (por su referencia). */
  enlazado: ActivoLocal | null;
  /** Activo local que tiene el n.º de inventario de GLPI como código. */
  conMismoCodigo: ActivoLocal | null;
  /** Elemento de GLPI que ya recibió ese código en esta misma ejecución. */
  asignadoEnEstaEjecucion?: string;
  /** Activo local que ya ocupa el código generado (caso muy raro). */
  conCodigoGenerado: ActivoLocal | null;
}

const baja = (local: ActivoLocal): Plan => ({
  accion: 'OMITIR',
  codigo: local.codigo,
  diferencias: {},
  motivo: `El activo ${local.codigo} está dado de baja en local; no se reactiva automáticamente.`,
  avisos: [],
});

/**
 * Decide qué hacer con un elemento de GLPI, sin tocar la base. Función pura.
 *
 * 1. Si ya hay un activo enlazado a ese elemento (por su referencia de GLPI),
 *    se actualiza: esa es la identidad fiable, aunque el código haya cambiado.
 * 2. Si no, se intenta con el n.º de inventario: libre → alta con ese código;
 *    lo tiene un activo registrado a mano → se enlaza, sin duplicar.
 * 3. Si ese n.º ya pertenece a OTRO elemento de GLPI (inventarios repetidos),
 *    el alta se hace con un código generado y se deja constancia.
 */
export function planificar(glpi: ActivoGlpi, contexto: Contexto): Plan {
  const { enlazado, conMismoCodigo, asignadoEnEstaEjecucion } = contexto;

  if (enlazado) {
    if (enlazado.deletedAt) return baja(enlazado);
    const diferencias = calcularCambios(enlazado, glpi.datos);
    return {
      accion:
        Object.keys(diferencias).length === 0 ? 'SIN_CAMBIOS' : 'ACTUALIZAR',
      codigo: enlazado.codigo,
      diferencias,
      avisos: [],
    };
  }

  const ocupante =
    asignadoEnEstaEjecucion ?? conMismoCodigo?.origenGlpi ?? undefined;
  if (!ocupante) {
    if (!conMismoCodigo) {
      return { accion: 'CREAR', codigo: glpi.codigo, diferencias: {}, avisos: [] };
    }
    if (conMismoCodigo.deletedAt) return baja(conMismoCodigo);
    return {
      accion: 'ENLAZAR',
      codigo: conMismoCodigo.codigo,
      diferencias: calcularCambios(conMismoCodigo, glpi.datos),
      motivo:
        'Registrado manualmente con el mismo código: se enlaza sin duplicar.',
      avisos: [],
    };
  }

  // El n.º de inventario ya es de otro elemento de GLPI.
  if (contexto.conCodigoGenerado) {
    return {
      accion: 'OMITIR',
      codigo: glpi.codigoGenerado,
      diferencias: {},
      motivo: `El n.º de inventario "${glpi.codigo}" ya lo usa ${ocupante} y el código alternativo "${glpi.codigoGenerado}" también está ocupado en local.`,
      avisos: [],
    };
  }
  return {
    accion: 'CREAR',
    codigo: glpi.codigoGenerado,
    diferencias: {},
    avisos: [
      `codigo: el n.º de inventario "${glpi.codigo}" ya lo usa ${ocupante}; se genera "${glpi.codigoGenerado}"`,
    ],
  };
}
