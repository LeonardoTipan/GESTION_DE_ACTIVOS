import { describe, expect, it } from 'vitest'
import { menuPara } from './navegacion.ts'

const rutas = (roles: Parameters<typeof menuPara>[0]) =>
  menuPara(roles).map((item) => item.ruta)

describe('menuPara', () => {
  it('admin ve todo, incluidos los catálogos', () => {
    expect(rutas(['admin'])).toContain('/catalogos')
    expect(rutas(['admin'])).toHaveLength(6)
  })

  it('analista y auditor no ven los catálogos', () => {
    for (const rol of ['analista', 'auditor'] as const) {
      expect(rutas([rol])).not.toContain('/catalogos')
      expect(rutas([rol])).toEqual([
        '/',
        '/activos',
        '/respaldos',
        '/mantenimientos',
        '/vulnerabilidades',
      ])
    }
  })
})
