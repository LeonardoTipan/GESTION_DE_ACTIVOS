import { formatearFecha, formatearFechaHora } from '../../../shared/formato.ts'

export const ETIQUETA_CAMPO: Record<string, string> = {
  codigo: 'Código operativo',
  nombre: 'Nombre',
  sistemas: 'Sistemas',
  custodio: 'Custodio',
  ubicacion: 'Ubicación',
  cifrado: 'Cifrado',
  ultimaRevision: 'Última revisión',
  numeroSerie: 'Número de serie',
  estado: 'Estado',
  fabricante: 'Fabricante',
  comentario: 'Comentario',
  numeroInventario: 'Número de inventario',
  codigoInstitucional: 'Código institucional original',
  direccionIp: 'Dirección IP',
  fechaCompra: 'Fecha de compra',
  tipo: 'Tipo',
  modelo: 'Modelo',
  tecnicoResponsable: 'Técnico responsable',
  red: 'Red',
  contacto: 'Contacto',
  fechaAlta: 'Fecha de alta',
  // Lo anota la sincronización al crear o enlazar un activo desde GLPI.
  origenGlpi: 'Origen en GLPI',
  categoriaId: 'Categoría',
  criticidadId: 'Criticidad',
  deletedAt: 'Fecha de baja',
}

export const ETIQUETA_ACCION: Record<string, string> = {
  CREAR: 'Alta del activo',
  ACTUALIZAR: 'Modificación',
  DAR_DE_BAJA: 'Baja del activo',
}

/** Nombres de los catálogos para mostrar "Hardware" en vez de "1". */
export interface NombresCatalogo {
  categorias: Map<number, string>
  criticidades: Map<number, string>
}

const ISO = /^\d{4}-\d{2}-\d{2}T/

/** Convierte un valor guardado en la bitácora en un texto legible. */
export function formatearValor(
  campo: string,
  valor: unknown,
  nombres: NombresCatalogo,
): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (campo === 'categoriaId' && typeof valor === 'number') {
    return nombres.categorias.get(valor) ?? `#${valor}`
  }
  if (campo === 'criticidadId' && typeof valor === 'number') {
    return nombres.criticidades.get(valor) ?? `#${valor}`
  }
  if (typeof valor === 'string' && ISO.test(valor)) {
    // La baja y el alta tienen hora real; la revisión es solo una fecha.
    return campo === 'deletedAt' || campo === 'fechaAlta'
      ? formatearFechaHora(valor)
      : formatearFecha(valor)
  }
  return String(valor)
}

export interface CambioLegible {
  campo: string
  antes: string
  despues: string
}

/** Detalle de la bitácora ({ campo: { antes, despues } }) → filas legibles. */
export function cambiosLegibles(
  detalle: Record<string, { antes?: unknown; despues?: unknown }>,
  nombres: NombresCatalogo,
): CambioLegible[] {
  return Object.entries(detalle).map(([campo, { antes, despues }]) => ({
    campo: ETIQUETA_CAMPO[campo] ?? campo,
    antes: formatearValor(campo, antes, nombres),
    despues: formatearValor(campo, despues, nombres),
  }))
}
