import { describe, expect, it } from 'vitest'
import { menuPara } from './navegacion.ts'

const rutas = (roles: Parameters<typeof menuPara>[0]) =>
  menuPara(roles).map((item) => item.ruta)

describe('menuPara', () => {
  it('admin ve todo, incluidos los catálogos', () => {
    expect(rutas(['admin'])).toContain('/catalogos')
    expect(rutas(['admin'])).toHaveLength(11)
  })

  it('las dos opciones provisionales están para cualquier usuario autenticado, tras Renovaciones', () => {
    for (const rol of ['admin', 'analista', 'auditor'] as const) {
      const r = rutas([rol])
      expect(r.indexOf('/proteccion-endpoints')).toBe(r.indexOf('/renovaciones') + 1)
      expect(r.indexOf('/evaluacion-sistemas-productivos')).toBe(r.indexOf('/renovaciones') + 2)
    }
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
        '/control-acceso',
        '/renovaciones',
        '/proteccion-endpoints',
        '/evaluacion-sistemas-productivos',
        '/calendario',
      ])
    }
  })
})
