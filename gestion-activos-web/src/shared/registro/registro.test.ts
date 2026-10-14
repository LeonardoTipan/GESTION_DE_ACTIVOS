import { describe, expect, it } from 'vitest'
import {
  errorMotivo,
  estadoRegistro,
  metaIndicador,
  periodoPorId,
  periodosDisponibles,
  valorIndicador,
} from './registro.ts'

const vigente = { version: 1, anuladoEn: null, anuladoPor: null, motivoAnulacion: null }

describe('estado del registro (columna "Reg.")', () => {
  it('versión, resaltada cuando ya se modificó; o Anulado', () => {
    expect(estadoRegistro(vigente)).toEqual({ etiqueta: 'v1', color: 'gray' })
    expect(estadoRegistro({ ...vigente, version: 3 })).toEqual({ etiqueta: 'v3', color: 'yellow' })
    expect(estadoRegistro({ ...vigente, anuladoEn: '2026-10-14T10:00:00Z' })).toEqual({
      etiqueta: 'Anulado',
      color: 'red',
    })
  })
})

describe('motivo de modificación, anulación o reversión', () => {
  it('obligatorio, de 20 a 300 caracteres', () => {
    expect(errorMotivo('   ')).toBe('Indique el motivo.')
    expect(errorMotivo('demasiado corto')).toBe('Mínimo 20 caracteres (lleva 15).')
    expect(errorMotivo('x'.repeat(301))).toBe('Máximo 300 caracteres.')
    expect(errorMotivo('Duplicado por error de digitación.')).toBeNull()
  })
})

describe('períodos de evaluación', () => {
  const hoy = new Date('2026-10-14T12:00:00Z')

  it('trimestre actual y anterior, semestre, año y todo', () => {
    expect(periodosDisponibles(hoy).map((p) => [p.id, p.etiqueta, p.desde, p.hasta])).toEqual([
      ['2026T4', 'IV Trimestre 2026', '2026-10-01', '2026-12-31'],
      ['2026T3', 'III Trimestre 2026', '2026-07-01', '2026-09-30'],
      ['2026S2', 'II Semestre 2026', '2026-07-01', '2026-12-31'],
      ['2026', 'Año 2026', '2026-01-01', '2026-12-31'],
      ['TODO', 'Todo el histórico', '2000-01-01', '2027-12-31'],
    ])
  })

  it('en el primer trimestre, el anterior es el IV del año pasado', () => {
    expect(periodosDisponibles(new Date('2026-02-01T00:00:00Z'))[1]).toMatchObject({
      id: '2025T4',
      desde: '2025-10-01',
    })
  })

  it('un período desconocido en la URL vuelve al trimestre actual', () => {
    expect(periodoPorId('inventado', hoy).id).toBe('2026T4')
    expect(periodoPorId('2026T3', hoy).id).toBe('2026T3')
  })
})

describe('presentación de indicadores', () => {
  it('valor con unidad, o "s/d"; meta con su sentido', () => {
    expect(valorIndicador({ valor: 98.5, unidad: '%' })).toBe('98,5 %')
    expect(valorIndicador({ valor: 180, unidad: 'min' })).toBe('180 min')
    expect(valorIndicador({ valor: 3, unidad: '' })).toBe('3')
    expect(valorIndicador({ valor: null, unidad: '%' })).toBe('s/d')
    expect(metaIndicador({ meta: 98, unidad: '%', direccion: 'subir' })).toBe('Meta ≥ 98 %')
    expect(metaIndicador({ meta: 0, unidad: '', direccion: 'bajar' })).toBe('Meta ≤ 0')
  })
})
