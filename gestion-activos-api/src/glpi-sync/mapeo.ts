import type { Itemtype } from './config.js';
import type { GlpiItem } from './glpi-client.js';
import { fechaGlpiAUtc, MAX_TEXTO, textoGlpi, truncar } from './saneamiento.js';

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

/** Un elemento de GLPI ya convertido a los campos de nuestro modelo Activo. */
export interface ActivoGlpi {
  itemtype: Itemtype;
  glpiId: number;
  codigo: string;
  /** false = GLPI no tenía n.º de inventario y el código se generó. */
  codigoDeInventario: boolean;
  /** Motivo por el que no debe sincronizarse (papelera o plantilla de GLPI). */
  excluido?: string;
  /**
   * SOLO lo que GLPI realmente informa. Es lo que se compara y actualiza: un
   * campo vacío en GLPI nunca pisa un dato bueno registrado en local.
   */
  datos: Partial<CamposGlpi>;
  /** Registro completo para un alta: `datos` + valores de relleno. */
  alCrear: CamposGlpi & { cifrado: boolean; ultimaRevision: Date };
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
  const datos: Partial<CamposGlpi> = {};

  /** Trunca a 191 dejando constancia. */
  const recortar = (nombre: string, valor: string): string => {
    const t = truncar(valor);
    if (t.truncado) {
      avisos.push(
        `${nombre}: truncado de ${t.longitudOriginal} a ${MAX_TEXTO} caracteres`,
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

  const inventario = textoGlpi(item.otherserial);
  const codigo = inventario
    ? recortar('codigo', inventario)
    : `GLPI-${PREFIJO[itemtype]}-${item.id}`;
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
    codigo,
    codigoDeInventario: inventario !== null,
    excluido: item.is_template
      ? 'Es una plantilla de GLPI, no un activo real.'
      : item.is_deleted
        ? 'Está en la papelera de GLPI (candidato a baja: revísalo en el inventario).'
        : undefined,
    datos,
    alCrear: {
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
