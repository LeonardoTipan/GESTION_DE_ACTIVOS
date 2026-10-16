import type { components } from '../../api/schema'
import { hoyLocal } from '../formato.ts'

/** Mínimo exigido al motivo de una modificación, anulación o reversión (igual que la API). */
export const MOTIVO_MINIMO = 20

export type Indicador = components['schemas']['IndicadorDto']
export type Traza = components['schemas']['TrazaDto']
export type EntidadTraza = Traza['entidad']

/** Lo que comparten los registros versionados y anulables. */
export interface Registro {
  version: number
  anuladoEn: string | null
  anuladoPor: string | null
  motivoAnulacion: string | null
}

/** Columna "Reg." del prototipo: vN, o Anulado. */
export function estadoRegistro(r: Registro): { etiqueta: string; color: string } {
  if (r.anuladoEn) return { etiqueta: 'Anulado', color: 'red' }
  return { etiqueta: `v${r.version}`, color: r.version > 1 ? 'yellow' : 'gray' }
}

/** Mensaje de error del motivo, o null si es válido. */
export function errorMotivo(motivo: string): string | null {
  const largo = motivo.trim().length
  if (largo === 0) return 'Indique el motivo.'
  if (largo < MOTIVO_MINIMO) return `Mínimo ${MOTIVO_MINIMO} caracteres (lleva ${largo}).`
  if (largo > 300) return 'Máximo 300 caracteres.'
  return null
}

// ── Períodos de evaluación (como en el prototipo) ───────────────────────────

export interface Periodo {
  id: string
  etiqueta: string
  desde: string
  hasta: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const ROMANOS = ['I', 'II', 'III', 'IV']
/** Hoy en la zona de la institución, como día UTC (los períodos son días de calendario). */
const hoyInstitucion = () => new Date(`${hoyLocal()}T00:00:00.000Z`)

/** Trimestre actual y anterior, semestre actual, año actual y todo el histórico. */
export function periodosDisponibles(hoy = hoyInstitucion()): Periodo[] {
  const y = hoy.getUTCFullYear()
  const q = Math.floor(hoy.getUTCMonth() / 3)
  const trimestre = (anio: number, t: number): Periodo => ({
    id: `${anio}T${t + 1}`,
    etiqueta: `${ROMANOS[t]} Trimestre ${anio}`,
    desde: iso(utc(anio, t * 3, 1)),
    hasta: iso(utc(anio, t * 3 + 3, 0)),
  })
  const anterior = q === 0 ? trimestre(y - 1, 3) : trimestre(y, q - 1)
  const s = hoy.getUTCMonth() < 6 ? 0 : 1
  return [
    trimestre(y, q),
    anterior,
    {
      id: `${y}S${s + 1}`,
      etiqueta: `${s === 0 ? 'I' : 'II'} Semestre ${y}`,
      desde: iso(utc(y, s * 6, 1)),
      hasta: iso(utc(y, s * 6 + 6, 0)),
    },
    { id: `${y}`, etiqueta: `Año ${y}`, desde: iso(utc(y, 0, 1)), hasta: iso(utc(y, 12, 0)) },
    { id: 'TODO', etiqueta: 'Todo el histórico', desde: '2000-01-01', hasta: iso(utc(y + 1, 12, 0)) },
  ]
}

/** El período de la URL, o el trimestre actual. */
export function periodoPorId(id: string | null, hoy = hoyInstitucion()): Periodo {
  const periodos = periodosDisponibles(hoy)
  return periodos.find((p) => p.id === id) ?? periodos[0]
}

// ── Indicadores ─────────────────────────────────────────────────────────────

export const ASPECTO_INDICADOR: Record<Indicador['estado'], { etiqueta: string; color: string }> = {
  EN_META: { etiqueta: 'En meta', color: 'green' },
  EN_OBSERVACION: { etiqueta: 'En observación', color: 'yellow' },
  FUERA_DE_META: { etiqueta: 'Fuera de meta', color: 'red' },
  SIN_DATOS: { etiqueta: 'Sin datos', color: 'gray' },
}

/** "98,5 %", "180 min", "3": el valor con su unidad, o "s/d". */
export function valorIndicador(i: Pick<Indicador, 'valor' | 'unidad'>): string {
  if (i.valor === null) return 's/d'
  const numero = i.valor.toLocaleString('es', { maximumFractionDigits: 1 })
  return i.unidad === '%' ? `${numero} %` : i.unidad ? `${numero} ${i.unidad}` : numero
}

/** "Meta ≥ 98 %" o "Meta ≤ 0". */
export function metaIndicador(i: Pick<Indicador, 'meta' | 'unidad' | 'direccion'>): string {
  const signo = i.direccion === 'bajar' ? '≤' : '≥'
  return `Meta ${signo} ${i.meta}${i.unidad === '%' ? ' %' : i.unidad ? ` ${i.unidad}` : ''}`
}
