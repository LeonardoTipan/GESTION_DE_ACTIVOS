import { describe, expect, it } from 'vitest'
import { periodoDeFecha } from './periodo.ts'

describe('período derivado de la fecha planificada', () => {
  it('15/03/2026 → Marzo, 2026, S1-2026', () => {
    expect(periodoDeFecha('2026-03-15')).toEqual({ anio: 2026, mes: 3, nombreMes: 'Marzo', semestre: 'S1-2026' })
  })

  it('junio es S1 y julio es S2; también con hora', () => {
    expect(periodoDeFecha('2026-06-30 23:59:00')?.semestre).toBe('S1-2026')
    expect(periodoDeFecha('2026-07-01 00:00:00')?.semestre).toBe('S2-2026')
  })

  it('se lee la fecha local tal cual: la noche del 31 de diciembre sigue siendo diciembre', () => {
    expect(periodoDeFecha('2026-12-31 23:30:00')).toMatchObject({ anio: 2026, mes: 12, semestre: 'S2-2026' })
  })

  it('sin fecha o con una fecha no válida, no hay período', () => {
    expect(periodoDeFecha(null)).toBeNull()
    expect(periodoDeFecha('')).toBeNull()
    expect(periodoDeFecha('2026-13-01')).toBeNull()
  })
})
