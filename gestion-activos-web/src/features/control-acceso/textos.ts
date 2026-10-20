import { formatearFechaHora } from '../../shared/formato.ts'
import type { EntradaHistorial, EstadoSolicitud, Situacion, Solicitud, TipoAcceso, TipoSolicitud } from './api.ts'

export const TIPO_ACCESO: Record<TipoAcceso, { etiqueta: string; color: string }> = {
  LOGICO: { etiqueta: 'Lógico', color: 'indigo' },
  FISICO: { etiqueta: 'Físico', color: 'teal' },
}

export const TIPO_SOLICITUD: Record<TipoSolicitud, string> = { ACCESO: 'Acceso', BAJA: 'Baja' }

export const ESTADO: Record<EstadoSolicitud, { etiqueta: string; color: string }> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  PENDIENTE: { etiqueta: 'Pendiente', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'green' },
}

/** Respecto a la fecha deseada; no es el estado (que lleva el flujo). */
export const SITUACION: Record<Situacion, { etiqueta: string; color: string }> = {
  PROGRAMADA: { etiqueta: 'Programada', color: 'gray' },
  PROXIMA: { etiqueta: 'Próxima (48 h)', color: 'orange' },
  VENCIDA: { etiqueta: 'Vencida', color: 'red' },
  ATENDIDA: { etiqueta: 'Atendida', color: 'green' },
}

/** El activo o, si no lo hay, el recurso no inventariado. */
export function destino(s: Pick<Solicitud, 'activo' | 'recurso'>): string {
  return s.activo ? `${s.activo.codigo} · ${s.activo.nombre}` : (s.recurso ?? '—')
}

const CAMPOS: Record<string, string> = {
  CREACION: 'Registro de la solicitud',
  codigoUnico: 'Código',
  tipoAcceso: 'Tipo de acceso',
  activoId: 'Activo',
  recurso: 'Recurso',
  fechaSolicitud: 'Fecha de solicitud',
  fechaAccesoDeseada: 'Fecha deseada',
  nombreUsuarioBeneficiario: 'Beneficiario',
  departamento: 'Departamento',
  tipoSolicitud: 'Tipo de solicitud',
  descripcion: 'Descripción',
  estado: 'Estado',
  resolucion: 'Resolución',
  fechaAtendido: 'Fecha de atención',
}

export const nombreCampo = (campo: string) => CAMPOS[campo] ?? campo

const FECHAS = new Set(['fechaSolicitud', 'fechaAccesoDeseada', 'fechaAtendido'])

/** Un valor del historial, legible: fechas en hora de la institución, enums con su nombre. */
export function valorLegible(campo: EntradaHistorial['campo'], valor: string | null): string {
  if (valor === null) return '—'
  if (FECHAS.has(campo)) return formatearFechaHora(valor)
  if (campo === 'estado') return ESTADO[valor as EstadoSolicitud]?.etiqueta ?? valor
  if (campo === 'tipoAcceso') return TIPO_ACCESO[valor as TipoAcceso]?.etiqueta ?? valor
  if (campo === 'tipoSolicitud') return TIPO_SOLICITUD[valor as TipoSolicitud] ?? valor
  if (campo === 'activoId') return `activo #${valor}`
  return valor
}
