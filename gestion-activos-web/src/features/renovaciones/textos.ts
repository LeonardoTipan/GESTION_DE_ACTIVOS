import type { EstadoRenovacion, Renovacion, TipoRenovacion, Vigencia } from './api.ts'

type Info = { etiqueta: string; color: string }

export const INFO_TIPO: Record<TipoRenovacion, string> = {
  LICENCIA: 'Licencia',
  GARANTIA: 'Garantía',
  CERTIFICADO: 'Certificado',
  CONTRATO_SERVICIO: 'Contrato de servicio',
  OTRO: 'Otro',
}
export const TIPOS = Object.keys(INFO_TIPO) as TipoRenovacion[]

/** Estado del PROCESO de renovación. */
export const INFO_ESTADO: Record<EstadoRenovacion, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'gray' },
}
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoRenovacion[]

/** Vigencia del ELEMENTO (licencia, garantía…): distinta del estado del proceso. */
export const INFO_VIGENCIA: Record<Vigencia, Info> = {
  VIGENTE: { etiqueta: 'Vigente', color: 'green' },
  PROXIMA: { etiqueta: 'Próximo a caducar', color: 'orange' },
  CADUCADA: { etiqueta: 'Caducado', color: 'red' },
  SIN_CADUCIDAD: { etiqueta: 'Sin caducidad', color: 'teal' },
  SUSTITUIDA: { etiqueta: 'Renovado después', color: 'gray' },
}
export const VIGENCIAS = Object.keys(INFO_VIGENCIA) as Vigencia[]

export type Accion = 'iniciar' | 'cerrar' | 'reabrir'

/** Las mismas transiciones que valida la API. */
export function accionesPermitidas(r: Pick<Renovacion, 'estado' | 'sustituidaPor'>): Accion[] {
  switch (r.estado) {
    case 'ABIERTO':
      return ['iniciar', 'cerrar']
    case 'EN_PROGRESO':
      return ['cerrar']
    case 'CERRADO':
      // Ya sustituida por una renovación posterior: no se reabre (se corrige la nueva).
      return r.sustituidaPor ? [] : ['reabrir']
  }
}

/** Texto de los días hasta la caducidad. */
export function textoDias(dias: number | null): string {
  if (dias === null) return ''
  if (dias < 0) return `caducó hace ${-dias} d`
  if (dias === 0) return 'caduca hoy'
  return `caduca en ${dias} d`
}

/** Lo que falta para cerrar (la API lo exige igual y responde con el mismo detalle). */
export function faltantesCierre(d: {
  fechaRenovacion: string | null
  nuevaFechaCaducidad: string | null
  nuevaSinCaducidad: boolean
  evidencia: string
  repositorioVerificable: string
  observacion: string
}): string[] {
  return [
    !d.fechaRenovacion && 'la fecha real de renovación',
    !d.nuevaSinCaducidad && !d.nuevaFechaCaducidad && 'la nueva fecha de caducidad (o marcar «sin caducidad»)',
    !d.evidencia.trim() && 'el verificable',
    !d.repositorioVerificable.trim() && 'el repositorio del verificable',
    d.nuevaSinCaducidad && !d.observacion.trim() && 'la justificación de «sin caducidad» en la observación',
  ].filter((x): x is string => Boolean(x))
}
