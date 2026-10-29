import type { EstadoPeriodo } from './api.ts'

type Info = { etiqueta: string; color: string }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const INFO_ESTADO: Record<EstadoPeriodo, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'blue' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  CERRADO: { etiqueta: 'Cerrado', color: 'gray' },
}
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoPeriodo[]

export const nombrePeriodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`

/** Situación de cada mes de un año en el calendario: su estado, «sin abrir» o futuro. */
export type SituacionMes = EstadoPeriodo | 'SIN_ABRIR' | 'FUTURO'

/**
 * Los 12 meses del año con su situación, a partir de los períodos REALES. «Hoy» (año y mes en
 * curso) lo da quien llama: un mes posterior es futuro (no se puede abrir).
 */
export function mesesDelAnio(
  periodos: { anio: number; mes: number; estado: EstadoPeriodo }[],
  anio: number,
  hoy: { anio: number; mes: number },
): { mes: number; situacion: SituacionMes }[] {
  const porMes = new Map(periodos.filter((p) => p.anio === anio).map((p) => [p.mes, p.estado]))
  return MESES.map((_, i) => {
    const mes = i + 1
    const estado = porMes.get(mes)
    if (estado) return { mes, situacion: estado }
    return { mes, situacion: anio * 12 + mes > hoy.anio * 12 + hoy.mes ? 'FUTURO' : 'SIN_ABRIR' }
  })
}

/** Meses ya transcurridos (incluido el actual) del año en curso que aún no tienen período. */
export const mesesSinAbrir = (meses: { situacion: SituacionMes }[]) => meses.filter((m) => m.situacion === 'SIN_ABRIR').length
