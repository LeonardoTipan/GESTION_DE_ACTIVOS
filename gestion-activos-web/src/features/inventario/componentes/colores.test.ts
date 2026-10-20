import { describe, expect, it } from 'vitest'
import { colorCriticidad } from './colores.ts'

describe('colorCriticidad', () => {
  it('asigna un color por nivel del seed, sin importar tildes ni mayúsculas', () => {
    expect(colorCriticidad('Baja')).toBe('green')
    expect(colorCriticidad('Media')).toBe('yellow')
    expect(colorCriticidad('ALTA')).toBe('orange')
    expect(colorCriticidad('Crítica')).toBe('red')
    expect(colorCriticidad('critica')).toBe('red')
  })

  it('un nivel desconocido se muestra en gris', () => {
    expect(colorCriticidad('Extrema')).toBe('gray')
  })
})
