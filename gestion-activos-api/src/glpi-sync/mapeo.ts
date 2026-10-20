import { TIPOS_GLPI, type Itemtype } from './config.js';
import type { GlpiItem } from './glpi-client.js';
import {
  fechaGlpiAUtc,
  MAX_TEXTO,
  MAX_TEXTO_LARGO,
  textoGlpi,
  textoLargoGlpi,
  truncar,
} from './saneamiento.js';


/** Cómo reconocer el código institucional dentro del comentario de GLPI. */
export interface ReglaCodigoInstitucional {
  /** Texto que lo precede en el comentario (p. ej. "QUITO TURISMO"). Vacío = no se busca. */
  etiqueta: string;
  /** Formato que debe cumplir para usarse como código operativo. */
  formato: RegExp;
}

/** Campos obligatorios de nuestro modelo Activo que GLPI puede informar. */
export interface CamposGlpi {
  nombre: string;
  sistemas: string;
  custodio: string;
  ubicacion: string;
}

/** Campos opcionales en nuestro modelo: si GLPI no los trae, quedan vacíos. */
export interface CamposTecnicos {
  /** GLPI: otherserial, tal cual. Puede repetirse entre equipos. */
  numeroInventario: string;
  /** Código institucional ORIGINAL anotado en el comentario, sin corregir. */
  codigoInstitucional: string;
  /** GLPI: serial */
  numeroSerie: string;
  /** GLPI: status.name */
  estado: string;
  /** GLPI: manufacturer.name */
  fabricante: string;
  /** GLPI: comment (texto largo, con sus saltos de línea) */
  comentario: string;
  /** GLPI: type.name (Laptop, Switch…) */
  tipo: string;
  /** GLPI: model.name */
  modelo: string;
  /** GLPI: user_tech.name */
  tecnicoResponsable: string;
  /** GLPI: network.name */
  red: string;
  /** GLPI: contact */
  contacto: string;
  /** GLPI: date_creation (cuándo se registró en GLPI), en UTC */
  fechaAlta: Date;
}

/** Valor que puede servir de código operativo, por orden de preferencia. */
export interface CandidatoCodigo {
  origen: 'institucional' | 'inventario';
  valor: string;
}

/** Un elemento de GLPI ya convertido a los campos de nuestro modelo Activo. */
export interface ActivoGlpi {
  itemtype: Itemtype;
  glpiId: number;
  /** IDENTIDAD del elemento en GLPI: tipo + id, p. ej. "Computer #12". */
  referencia: string;
  /**
   * Códigos operativos posibles, del más al menos preferido: el institucional
   * (solo si cumple el formato) y el n.º de inventario. Que se usen depende
   * de que sean únicos: lo decide planificar().
   */
  candidatos: CandidatoCodigo[];
  /** Código de respaldo, determinista y único: "GLPI-PC-12". */
  codigoRespaldo: string;
  /** Motivo por el que no debe sincronizarse (plantilla de GLPI). */
  excluido?: string;
  /**
   * Está en la papelera de GLPI: se conserva en el inventario como "Dado de baja".
   * No compite por los códigos operativos (candidatos vacío).
   */
  enPapelera: boolean;
  /**
   * SOLO lo que GLPI realmente informa. Es lo que se compara y actualiza: un
   * campo vacío en GLPI nunca pisa un dato bueno registrado en local.
   */
  datos: Partial<CamposGlpi & CamposTecnicos>;
  /** Registro completo para un alta: `datos` + valores de relleno. */
  alCrear: CamposGlpi &
    Partial<CamposTecnicos> & { cifrado: boolean; ultimaRevision: Date };
  /** Constancia de saneamientos: truncados, valores de relleno, fechas ausentes. */
  avisos: string[];
  /** Casos que una persona debería revisar (códigos dudosos o ausentes). */
  revision: string[];
}

const RELLENO = {
  sistemas: 'No especificado',
  custodio: 'Sin asignar',
  ubicacion: 'Sin ubicación',
} as const;

const escaparRegExp = (texto: string): string =>
  texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * SOLO "S/N" (o "sin número"), sin nada más = el equipo no tiene código.
 * "S/N: 7-1-22-183" NO entra aquí: lleva un valor detrás y se conserva entero.
 */
const SIN_NUMERO = /^(s\s*\/?\s*n|sin\s+n[uú]mero)\s*[:.\-]*$/i;

/**
 * Lee del comentario lo que sigue a la etiqueta institucional, TAL CUAL está
 * escrito: "QUITO TURISMO: 7-1-22-177" → "7-1-22-177". No corrige nada.
 */
export function extraerCodigoInstitucional(
  comentario: unknown,
  etiqueta: string,
): string | null {
  if (typeof comentario !== 'string' || !etiqueta.trim()) return null;
  const patron = new RegExp(
    `${escaparRegExp(etiqueta.trim()).replace(/\s+/g, '\\s+')}\\s*:?\\s*(.*)$`,
    'i',
  );
  for (const linea of comentario.split(/\r\n|\r|\n/)) {
    const m = patron.exec(linea);
    if (m) return textoGlpi(m[1]);
  }
  return null;
}

/**
 * El listado no trae el sistema operativo como campo, pero en `comment` suele
 * anotarse en una línea propia: "Sistema Operativo Windows 11 Pro".
 */
function sistemaOperativoDelComentario(comentario: unknown): string | null {
  if (typeof comentario !== 'string') return null;
  for (const linea of comentario.split(/\r?\n/)) {
    const m = /^\s*sistema\s+operativo\s*[:\-–]?\s*(.+)$/i.exec(linea);
    if (m) return textoGlpi(m[1]);
  }
  return null;
}

/**
 * Qué describe mejor "sistemas" según el tipo: en equipos, el SO anotado en
 * el comentario y, si no hay, el modelo o el tipo; en software, su categoría.
 */
function sistemasDe(itemtype: Itemtype, item: GlpiItem): string | null {
  return itemtype === 'Software'
    ? textoGlpi(item.category)
    : (sistemaOperativoDelComentario(item.comment) ??
        textoGlpi(item.model) ??
        textoGlpi(item.type));
}

/**
 * Convierte un elemento de la API v2 de GLPI a nuestro modelo, saneando
 * textos y fechas. Función pura: no consulta GLPI ni la base de datos.
 */
export function mapearActivo(
  itemtype: Itemtype,
  item: GlpiItem,
  zonaHoraria: string,
  regla: ReglaCodigoInstitucional,
  ahora: Date = new Date(),
): ActivoGlpi {
  const avisos: string[] = [];
  const revision: string[] = [];
  const datos: Partial<CamposGlpi & CamposTecnicos> = {};

  /** Trunca (a 191 por defecto) dejando constancia. */
  const recortar = (nombre: string, valor: string, max = MAX_TEXTO): string => {
    const t = truncar(valor, max);
    if (t.truncado) {
      avisos.push(
        `${nombre}: truncado de ${t.longitudOriginal} a ${max} caracteres`,
      );
    }
    return t.valor;
  };

  /** Texto que GLPI informa → entra en `datos`. Si viene vacío → relleno solo para altas. */
  const campo = (
    nombre: keyof CamposGlpi,
    valor: string | null,
    relleno: string,
  ): string => {
    if (valor === null) {
      avisos.push(
        `${nombre}: vacío en GLPI (en un alta se usaría "${relleno}"; un activo existente no se toca)`,
      );
      return relleno;
    }
    return (datos[nombre] = recortar(nombre, valor));
  };

  /** Dato opcional: si GLPI no lo trae, ni se guarda ni se inventa. */
  const tecnico = (
    nombre: Exclude<keyof CamposTecnicos, 'fechaAlta'>,
    valor: string | null,
    max = MAX_TEXTO,
  ): void => {
    if (valor !== null) datos[nombre] = recortar(nombre, valor, max);
  };

  // ── Códigos ──────────────────────────────────────────────────────────────
  const candidatos: CandidatoCodigo[] = [];
  const institucional = extraerCodigoInstitucional(item.comment, regla.etiqueta);
  if (institucional === null) {
    // Solo los equipos físicos llevan etiqueta institucional (un programa, no).
    if (regla.etiqueta && TIPOS_GLPI[itemtype].fisico) {
      revision.push(
        `Sin código institucional: el comentario no contiene "${regla.etiqueta}: …".`,
      );
    }
  } else if (SIN_NUMERO.test(institucional)) {
    revision.push(
      `Código institucional anotado como "${institucional}" (sin número asignado).`,
    );
  } else {
    // Se conserva SIEMPRE el valor original, cumpla o no el formato.
    tecnico('codigoInstitucional', institucional);
    if (regla.formato.test(institucional)) {
      candidatos.push({
        origen: 'institucional',
        valor: datos.codigoInstitucional!,
      });
    } else {
      revision.push(
        `Código institucional "${institucional}" con formato irregular: se conserva tal cual (sin corregir), pero no se usa como código operativo.`,
      );
    }
  }

  const enPapelera = item.is_deleted === true || item.is_deleted === 1;
  tecnico('numeroInventario', textoGlpi(item.otherserial));
  // Un elemento en la papelera no disputa códigos a los equipos vigentes.
  if (enPapelera) candidatos.length = 0;
  else if (datos.numeroInventario) {
    candidatos.push({ origen: 'inventario', valor: datos.numeroInventario });
  }

  // ── Datos ────────────────────────────────────────────────────────────────
  const nombre = campo('nombre', textoGlpi(item.name), `${itemtype} ${item.id}`);
  const sistemas = campo('sistemas', sistemasDe(itemtype, item), RELLENO.sistemas);
  const custodio = campo(
    'custodio',
    textoGlpi(item.user) ?? textoGlpi(item.contact) ?? textoGlpi(item.user_tech),
    RELLENO.custodio,
  );
  const ubicacion = campo('ubicacion', textoGlpi(item.location), RELLENO.ubicacion);

  tecnico('numeroSerie', textoGlpi(item.serial));
  tecnico('estado', textoGlpi(item.status) ?? textoGlpi(item.state));
  tecnico('fabricante', textoGlpi(item.manufacturer));
  // Columna TEXT: se guarda completo, con sus saltos de línea.
  tecnico('comentario', textoLargoGlpi(item.comment), MAX_TEXTO_LARGO);
  tecnico('tipo', textoGlpi(item.type));
  tecnico('modelo', textoGlpi(item.model));
  tecnico('tecnicoResponsable', textoGlpi(item.user_tech));
  tecnico('red', textoGlpi(item.network));
  tecnico('contacto', textoGlpi(item.contact));
  const fechaAlta = fechaGlpiAUtc(item.date_creation, zonaHoraria);
  if (fechaAlta) datos.fechaAlta = fechaAlta;

  const fechaCruda =
    item.last_inventory_update ?? item.date_mod ?? item.date_creation;
  let ultimaRevision = fechaGlpiAUtc(fechaCruda, zonaHoraria);
  if (!ultimaRevision) {
    avisos.push('ultimaRevision: sin fecha válida en GLPI, se usa la actual');
    ultimaRevision = ahora;
  }

  return {
    itemtype,
    glpiId: item.id,
    referencia: `${itemtype} #${item.id}`,
    candidatos,
    codigoRespaldo: `GLPI-${TIPOS_GLPI[itemtype].prefijo}-${item.id}`,
    excluido: item.is_template
      ? 'Es una plantilla de GLPI, no un activo real.'
      : undefined,
    enPapelera,
    datos,
    alCrear: {
      ...datos,
      nombre,
      sistemas,
      custodio,
      ubicacion,
      // El listado de GLPI no informa del cifrado: se registra en nuestra app.
      cifrado: false,
      // Solo al crear: después la fecha de revisión la gestiona nuestra app.
      ultimaRevision,
    },
    avisos,
    revision,
  };
}
