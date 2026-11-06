import { describe, expect, it } from 'vitest'
import { aniosBitacora, colorPorcentaje, textoPorcentaje, textoVariacion, variacion, type PeriodoIndicador } from './bitacora.ts'

const p = (porcentaje: number | null): PeriodoIndicador => ({
  clave: 'x', etiqueta: 'x', desde: '', hasta: '', situacion: 'CERRADO', numerador: 0, denominador: 0, porcentaje,
})

describe('bitácora compartida', () => {
  it('N/D sin porcentaje; formato con un decimal', () => {
    expect(textoPorcentaje(null)).toBe('N/D')
    expect(textoPorcentaje(96.2)).toBe('96,2 %')
    expect(colorPorcentaje(null)).toBe('gray')
    expect(colorPorcentaje(95)).toBe('green')
    expect(colorPorcentaje(50)).toBe('red')
  })

  it('variación solo cuando los dos períodos tienen datos', () => {
    const ps = [p(50), p(75), p(null), p(80)]
    expect(variacion(ps, 0)).toBeNull()
    expect(variacion(ps, 1)).toBe(25)
    expect(variacion(ps, 2)).toBeNull()
    expect(variacion(ps, 3)).toBeNull()
    expect(textoVariacion(25)).toBe('▲ +25 pp')
    expect(textoVariacion(-2.5)).toBe('▼ -2,5 pp')
    expect(textoVariacion(null)).toBe('—')
  })

  it('años del selector', () => {
    expect(aniosBitacora(2026)).toEqual(['2027', '2026', '2025', '2024', '2023', '2022', '2021'])
  })
})
