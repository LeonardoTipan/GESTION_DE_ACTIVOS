import { describe, expect, it } from 'vitest'
import { tieneRol } from './roles.ts'

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
