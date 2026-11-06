/** Nombres de los meses (1 = enero). */
export const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export interface PeriodoDerivado {
  anio: number
  mes: number
  nombreMes: string
  /** «S1-2026»: S1 enero–junio, S2 julio–diciembre. */
  semestre: string
}

/**
 * Mes, año y semestre de una fecha LOCAL («AAAA-MM-DD» o «AAAA-MM-DD HH:mm:ss», ya en la hora de
 * la institución): se leen del texto, sin pasar por UTC, para que una fecha de noche no cambie de
 * mes. El usuario elige la fecha; estos valores se calculan, no se escriben.
 */
export function periodoDeFecha(fechaLocal: string | null | undefined): PeriodoDerivado | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaLocal ?? '')
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return null
  return { anio, mes, nombreMes: NOMBRES_MES[mes - 1], semestre: `S${mes <= 6 ? 1 : 2}-${anio}` }
}
