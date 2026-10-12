import type { Itemtype } from './config.js';
import type { GlpiItem } from './glpi-client.js';
import {
  fechaGlpiAUtc,
  MAX_TEXTO,
  MAX_TEXTO_LARGO,
  textoGlpi,
  textoLargoGlpi,
  truncar,
} from './saneamiento.js';

/** Prefijo del código generado cuando GLPI no tiene número de inventario. */
const PREFIJO: Record<Itemtype, string> = {
  Computer: 'PC',
  NetworkEquipment: 'RED',
  Software: 'SW',
};

/** Campos de nuestro modelo Activo que GLPI puede informar. */
export interface CamposGlpi {
  nombre: string;
  sistemas: string;
  custodio: string;
  ubicacion: string;
}

/** Datos técnicos, opcionales en nuestro modelo: si GLPI no los trae, quedan vacíos. */
export interface CamposTecnicos {
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

/** Un elemento de GLPI ya convertido a los campos de nuestro modelo Activo. */
export interface ActivoGlpi {
  itemtype: Itemtype;
  glpiId: number;
  /** Identidad del elemento en GLPI: "Computer #12". */
  referencia: string;
  /** Código preferido: el n.º de inventario de GLPI (o el generado si no tiene). */
  codigo: string;
  /** Código alternativo, siempre único: se usa si el preferido ya está ocupado. */
  codigoGenerado: string;
  /** false = GLPI no tenía n.º de inventario y el código se generó. */
  codigoDeInventario: boolean;
  /** Motivo por el que no debe sincronizarse (papelera o plantilla de GLPI). */
  excluido?: string;
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
}

const RELLENO = {
  sistemas: 'No especificado',
  custodio: 'Sin asignar',
  ubicacion: 'Sin ubicación',
} as const;

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
  ahora: Date = new Date(),
): ActivoGlpi {
  const avisos: string[] = [];
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

  /** Dato técnico opcional: si GLPI no lo trae, ni se guarda ni se avisa. */
  const tecnico = (
    nombre: Exclude<keyof CamposTecnicos, 'fechaAlta'>,
    valor: string | null,
    max = MAX_TEXTO,
  ): void => {
    if (valor !== null) datos[nombre] = recortar(nombre, valor, max);
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

  const inventario = textoGlpi(item.otherserial);
  const codigoGenerado = `GLPI-${PREFIJO[itemtype]}-${item.id}`;
  const codigo = inventario ? recortar('codigo', inventario) : codigoGenerado;
  if (!inventario) {
    avisos.push(`codigo: sin n.º de inventario en GLPI, se genera "${codigo}"`);
  }

  const nombre = campo('nombre', textoGlpi(item.name), `${itemtype} ${item.id}`);
  const sistemas = campo('sistemas', sistemasDe(itemtype, item), RELLENO.sistemas);
  const custodio = campo(
    'custodio',
    textoGlpi(item.user) ?? textoGlpi(item.contact) ?? textoGlpi(item.user_tech),
    RELLENO.custodio,
  );
  const ubicacion = campo('ubicacion', textoGlpi(item.location), RELLENO.ubicacion);

  tecnico('numeroSerie', textoGlpi(item.serial));
  tecnico('estado', textoGlpi(item.status));
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
    codigo,
    codigoGenerado,
    codigoDeInventario: inventario !== null,
    excluido: item.is_template
      ? 'Es una plantilla de GLPI, no un activo real.'
      : item.is_deleted
        ? 'Está en la papelera de GLPI (candidato a baja: revísalo en el inventario).'
        : undefined,
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
  };
}
