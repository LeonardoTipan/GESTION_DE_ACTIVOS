import {
  calcularCambios,
  type Cambios,
} from '../inventory/bitacora/cambios.js';
import type { ActivoGlpi, CandidatoCodigo } from './mapeo.js';

/** Autor con el que el proceso firma el historial de los activos. */
export const RESPONSABLE_GLPI = 'GLPI';

/** Lo que necesitamos saber del activo local para decidir. */
export interface ActivoLocal {
  id: number;
  /** Código operativo de la aplicación (único, editable). */
  codigo: string;
  /** Elemento de GLPI del que procede ("Computer #12"); null si se registró a mano. */
  origenGlpi: string | null;
  numeroInventario: string | null;
  codigoInstitucional: string | null;
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
  /** Activo registrado a mano con coincidencia inequívoca: se vincula, sin duplicar. */
  | 'ENLAZAR'
  /** Ya vinculado y GLPI trae cambios. */
  | 'ACTUALIZAR'
  | 'SIN_CAMBIOS'
  /** No se toca (p. ej. dado de baja en local). */
  | 'OMITIR';

export interface Plan {
  accion: Accion;
  /** Código operativo: el que el activo ya tiene o el que tendrá al crearse. */
  codigo: string;
  /** Activo local sobre el que se actúa (vinculado o por vincular). */
  local: ActivoLocal | null;
  /** Diferencias local → GLPI: { campo: { antes, despues } }. */
  diferencias: Cambios;
  motivo?: string;
  /** Casos que una persona debería revisar. */
  revision: string[];
}

/** Lo que se sabe de un candidato a código al decidir. */
export interface CandidatoEvaluado extends CandidatoCodigo {
  /** Otros elementos de GLPI con ese mismo valor (referencias). Vacío = único. */
  repetidoEn: string[];
  /** Activo local (vinculado, manual o de baja) cuyo código operativo es ese valor. */
  conEseCodigo: ActivoLocal | null;
  /**
   * Activos registrados a MANO y vigentes que coinciden con el valor, por su
   * código operativo o por el campo equivalente (n.º de inventario o código
   * institucional). Son los posibles destinos de una vinculación.
   */
  manuales: ActivoLocal[];
}

/** Lo que se sabe del entorno al decidir sobre un elemento de GLPI. */
export interface Contexto {
  /** Activo local ya vinculado a ESTE elemento de GLPI (por su referencia). */
  vinculado: ActivoLocal | null;
  /** Candidatos a código, del más al menos preferido. */
  candidatos: CandidatoEvaluado[];
  /** Activo local que ya ocupa el código de respaldo (caso muy raro). */
  conCodigoRespaldo: ActivoLocal | null;
  /** Códigos y activos ya comprometidos en esta misma ejecución. */
  reservados: {
    /** claveCodigo(código) → referencia de GLPI que lo recibió. */
    codigos: ReadonlyMap<string, string>;
    /** id de activo manual → referencia de GLPI con la que se vinculó. */
    manuales: ReadonlyMap<number, string>;
  };
}

const clave = (codigo: string): string => codigo.trim().toLowerCase();

const NOMBRE_ORIGEN = {
  institucional: 'código institucional',
  inventario: 'n.º de inventario',
} as const;

/** "Computer #2, Computer #3, Computer #4 y 19 más": no inunda el informe. */
const otros = (referencias: string[]): string =>
  referencias.length <= 3
    ? referencias.join(', ')
    : `${referencias.slice(0, 3).join(', ')} y ${referencias.length - 3} más`;

const lista = (activos: ActivoLocal[]): string =>
  activos.map((a) => `${a.codigo} (id ${a.id})`).join(', ');

/**
 * Decide qué hacer con un elemento de GLPI, sin tocar la base. Función pura.
 *
 * IDENTIDAD: la referencia de GLPI (tipo + id). Si ya hay un activo vinculado
 * a ella, se actualiza ese y nada más; su código operativo no se toca.
 *
 * VINCULACIÓN de un activo registrado a mano: solo si la coincidencia es
 * inequívoca (valor único en GLPI y un único activo manual candidato). Ante
 * la duda NO se combinan registros: se crea el activo aparte y se avisa.
 *
 * CÓDIGO OPERATIVO de un alta: 1) código institucional válido y único,
 * 2) n.º de inventario único, 3) código de respaldo "GLPI-PC-12".
 */
export function planificar(glpi: ActivoGlpi, contexto: Contexto): Plan {
  const { vinculado, candidatos, reservados } = contexto;
  const revision: string[] = [];

  // ── 1. Ya vinculado: se actualiza por su identidad ───────────────────────
  if (vinculado) {
    if (vinculado.deletedAt) {
      return {
        accion: 'OMITIR',
        codigo: vinculado.codigo,
        local: vinculado,
        diferencias: {},
        motivo: `El activo ${vinculado.codigo} está dado de baja en local; no se reactiva automáticamente.`,
        revision,
      };
    }
    const diferencias = calcularCambios(vinculado, glpi.datos);
    return {
      accion:
        Object.keys(diferencias).length === 0 ? 'SIN_CAMBIOS' : 'ACTUALIZAR',
      codigo: vinculado.codigo,
      local: vinculado,
      diferencias,
      revision,
    };
  }

  // ── 2. ¿Hay un activo manual que vincular con seguridad? ─────────────────
  for (const candidato of candidatos) {
    const libres = candidato.manuales.filter(
      (m) => !reservados.manuales.has(m.id),
    );
    if (libres.length === 0) continue;
    const nombre = NOMBRE_ORIGEN[candidato.origen];
    if (candidato.repetidoEn.length > 0) {
      revision.push(
        `No se vincula con ${lista(libres)}: el ${nombre} "${candidato.valor}" está repetido en GLPI (${otros(candidato.repetidoEn)}). Revísalo a mano.`,
      );
      continue;
    }
    if (libres.length > 1) {
      revision.push(
        `No se vincula: hay ${libres.length} activos manuales con el ${nombre} "${candidato.valor}" (${lista(libres)}). Revísalo a mano.`,
      );
      continue;
    }
    const manual = libres[0];
    return {
      accion: 'ENLAZAR',
      codigo: manual.codigo,
      local: manual,
      diferencias: calcularCambios(manual, glpi.datos),
      motivo: `Registrado manualmente con el mismo ${nombre} ("${candidato.valor}"): se vincula sin duplicar.`,
      revision,
    };
  }

  // ── 3. Alta: elegir el código operativo ──────────────────────────────────
  let codigo: string | null = null;
  for (const candidato of candidatos) {
    const nombre = NOMBRE_ORIGEN[candidato.origen];
    const reservadoPor = reservados.codigos.get(clave(candidato.valor));
    if (candidato.repetidoEn.length > 0) {
      revision.push(
        `El ${nombre} "${candidato.valor}" está repetido en GLPI (${otros(candidato.repetidoEn)}): no se usa como código.`,
      );
    } else if (candidato.conEseCodigo) {
      const otro = candidato.conEseCodigo;
      revision.push(
        `El ${nombre} "${candidato.valor}" ya es el código del activo local id ${otro.id}${otro.origenGlpi ? ` (${otro.origenGlpi})` : otro.deletedAt ? ' (dado de baja)' : ''}: no se usa como código.`,
      );
    } else if (reservadoPor) {
      revision.push(
        `El ${nombre} "${candidato.valor}" ya se asignó a ${reservadoPor} en esta ejecución: no se usa como código.`,
      );
    } else {
      codigo = candidato.valor;
      break;
    }
  }

  if (codigo === null) {
    const ocupante =
      contexto.conCodigoRespaldo?.id ??
      reservados.codigos.get(clave(glpi.codigoRespaldo));
    if (ocupante !== undefined) {
      return {
        accion: 'OMITIR',
        codigo: glpi.codigoRespaldo,
        local: null,
        diferencias: {},
        motivo: `No hay un código libre: el de respaldo "${glpi.codigoRespaldo}" ya está ocupado en local. Revísalo a mano.`,
        revision,
      };
    }
    codigo = glpi.codigoRespaldo;
  }

  return { accion: 'CREAR', codigo, local: null, diferencias: {}, revision };
}
