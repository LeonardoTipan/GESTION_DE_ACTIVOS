import { describe, expect, it } from 'vitest'
import { puedeAdministrar, puedeOperar, tieneRol } from './roles.ts'

describe('tieneRol', () => {
  it('lista vacía = cualquier usuario autenticado', () => {
    expect(tieneRol(['auditor'], [])).toBe(true)
  })

  it('basta con tener uno de los roles pedidos', () => {
    expect(tieneRol(['analista'], ['admin', 'analista'])).toBe(true)
  })

  it('sin ninguno de los roles pedidos → false', () => {
    expect(tieneRol(['auditor'], ['admin'])).toBe(false)
    expect(tieneRol([], ['admin'])).toBe(false)
  })
})

describe('puedeOperar', () => {
  it('admin y analista operan', () => {
    expect(puedeOperar(['admin'])).toBe(true)
    expect(puedeOperar(['analista'])).toBe(true)
  })

  it('el auditor solo lee: nunca opera', () => {
    expect(puedeOperar(['auditor'])).toBe(false)
    expect(puedeOperar([])).toBe(false)
  })
})

describe('puedeAdministrar', () => {
  it('solo el admin (p. ej. aceptar riesgo)', () => {
    expect(puedeAdministrar(['admin'])).toBe(true)
    expect(puedeAdministrar(['analista'])).toBe(false)
    expect(puedeAdministrar(['auditor'])).toBe(false)
  })
})
