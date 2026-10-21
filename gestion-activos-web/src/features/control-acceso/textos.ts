import { formatearFechaHora } from '../../shared/formato.ts'
import type { EntradaHistorial, EstadoSolicitud, Solicitud, TipoAcceso, TipoSolicitud } from './api.ts'

export const TIPO_ACCESO: Record<TipoAcceso, { etiqueta: string; color: string }> = {
  LOGICO: { etiqueta: 'Lógico', color: 'indigo' },
  FISICO: { etiqueta: 'Físico', color: 'teal' },
}

/**
 * ACCESO = otorgamiento de acceso (ALTA); BAJA = desvinculación de acceso (BAJA).
 * Ninguna de las dos modifica el activo ni lo retira de GLPI.
 */
export const TIPO_SOLICITUD: Record<TipoSolicitud, { etiqueta: string; corto: string; color: string }> = {
  ACCESO: { etiqueta: 'Otorgamiento de acceso', corto: 'ALTA', color: 'green' },
  BAJA: { etiqueta: 'Desvinculación de acceso', corto: 'BAJA', color: 'red' },
}

export const ESTADO: Record<EstadoSolicitud, { etiqueta: string; color: string }> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  PENDIENTE: { etiqueta: 'Pendiente', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'green' },
}

/** Cómo se muestra un dato que las solicitudes anteriores a su existencia no tienen. */
export const NO_REGISTRADO = 'No registrado'

/** El activo o, si no lo hay, el recurso no inventariado. */
export function destino(s: Pick<Solicitud, 'activo' | 'recurso'>): string {
  return s.activo ? `${s.activo.codigo} · ${s.activo.nombre}` : (s.recurso ?? '—')
}

/** Solicitante con su cargo; en solicitudes antiguas, «No registrado» (no se inventa). */
export function solicitante(s: Pick<Solicitud, 'nombreSolicitante' | 'cargoSolicitante'>): { nombre: string; cargo: string | null } {
  return s.nombreSolicitante ? { nombre: s.nombreSolicitante, cargo: s.cargoSolicitante } : { nombre: NO_REGISTRADO, cargo: null }
}

const CAMPOS: Record<string, string> = {
  CREACION: 'Registro de la solicitud',
  codigoUnico: 'Código',
  tipoAcceso: 'Tipo de acceso',
  activoId: 'Activo',
  recurso: 'Recurso',
  fechaSolicitud: 'Fecha de solicitud',
  nombreSolicitante: 'Solicitante',
  cargoSolicitante: 'Cargo del solicitante',
  nombreUsuarioBeneficiario: 'Beneficiario',
  departamento: 'Departamento',
  tipoSolicitud: 'Tipo de solicitud',
  descripcion: 'Descripción',
  estado: 'Estado',
  resolucion: 'Resolución',
  fechaAtendido: 'Fecha atendida',
  // Retirado el 2026-10-21: su último valor quedó en el historial (usuario SISTEMA).
  fechaAccesoDeseada: 'Fecha deseada (campo retirado)',
}

export const nombreCampo = (campo: string) => CAMPOS[campo] ?? campo

const FECHAS = new Set(['fechaSolicitud', 'fechaAtendido', 'fechaAccesoDeseada'])

/** Un valor del historial, legible: fechas en hora de la institución, enums con su nombre. */
export function valorLegible(campo: EntradaHistorial['campo'], valor: string | null): string {
  if (valor === null) return '—'
  if (FECHAS.has(campo)) return formatearFechaHora(valor)
  if (campo === 'estado') return ESTADO[valor as EstadoSolicitud]?.etiqueta ?? valor
  if (campo === 'tipoAcceso') return TIPO_ACCESO[valor as TipoAcceso]?.etiqueta ?? valor
  if (campo === 'tipoSolicitud') {
    const t = TIPO_SOLICITUD[valor as TipoSolicitud]
    return t ? `${t.corto} · ${t.etiqueta}` : valor
  }
  if (campo === 'activoId') return `activo #${valor}`
  return valor
}

/**
 * Atenciones anteriores de una solicitud reabierta, reconstruidas del historial:
 * al reabrir, la fecha atendida y la resolución pasan a ser el «valor anterior»
 * de sus entradas, con el motivo de la reapertura. Así no se pierde la atención.
 */
export function atencionesAnteriores(historial: EntradaHistorial[]) {
  return historial
    .filter((h) => h.campo === 'fechaAtendido' && h.valorAnterior !== null && h.valorNuevo === null)
    .map((h) => ({
      fechaAtendido: h.valorAnterior!,
      resolucion: historial.find((r) => r.campo === 'resolucion' && r.fecha === h.fecha && r.valorNuevo === null)?.valorAnterior ?? null,
      reabiertaEl: h.fecha,
      reabiertaPor: h.usuario,
      motivo: h.motivo,
    }))
}
