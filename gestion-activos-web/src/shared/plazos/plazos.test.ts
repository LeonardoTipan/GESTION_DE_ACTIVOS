import { describe, expect, it } from 'vitest'
import { avisoFueraDePlazo, posicionEnPlazo } from './plazos.ts'

describe('plazos (interfaz)', () => {
  const inicio = '2026-10-10T13:00:00Z'
  const limite = '2026-10-12T22:00:00Z'
  it('misma regla que la API', () => {
    expect(posicionEnPlazo('2026-10-11T00:00:00Z', inicio, limite)).toBe('EN_PLAZO')
    expect(posicionEnPlazo('2026-10-09T00:00:00Z', inicio, limite)).toBe('ANTES')
    expect(posicionEnPlazo('2026-10-13T00:00:00Z', inicio, limite)).toBe('DESPUES')
    expect(posicionEnPlazo('2026-10-13T00:00:00Z', null, null)).toBe('SIN_PLAZO')
  })
  it('solo avisa fuera del intervalo', () => {
    expect(avisoFueraDePlazo('El inicio', '2026-10-11T00:00:00Z', inicio, limite)).toBeNull()
    expect(avisoFueraDePlazo('El inicio', '2026-10-13T00:00:00Z', inicio, limite)).toMatch(/después del límite/)
  })
})
