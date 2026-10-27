import { describe, expect, it } from 'vitest'
import { pendientesDe, textoPendientes } from './pendientes.ts'

const datos = { accesos: 3, mantenimientos: 1, vulnerabilidades: 0, renovaciones: 2, total: 6 }

describe('pendientes del tablero', () => {
  it('cada tarjeta de módulo toma su conteo', () => {
    expect(pendientesDe('/control-acceso', datos)).toBe(3)
    expect(pendientesDe('/mantenimientos', datos)).toBe(1)
    expect(pendientesDe('/vulnerabilidades', datos)).toBe(0)
    expect(pendientesDe('/renovaciones', datos)).toBe(2)
  })

  it('sin datos (cargando o error) o en otros módulos no muestra nada, nunca 0', () => {
    expect(pendientesDe('/renovaciones', undefined)).toBeNull()
    expect(pendientesDe('/activos', datos)).toBeNull()
    expect(pendientesDe('/calendario', datos)).toBeNull()
  })

  it('texto en singular y plural', () => {
    expect(textoPendientes(1)).toBe('1 pendiente')
    expect(textoPendientes(0)).toBe('0 pendientes')
    expect(textoPendientes(12)).toBe('12 pendientes')
  })
})
