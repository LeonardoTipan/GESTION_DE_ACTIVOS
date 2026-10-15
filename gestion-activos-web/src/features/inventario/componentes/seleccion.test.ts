import { describe, expect, it } from 'vitest'
import { agregar, alternar, opcionesCategoria } from './seleccion.ts'

describe('selección de activos', () => {
  it('"Todas las categorías" es la primera opción; el resto, las reales con su recuento', () => {
    expect(opcionesCategoria([{ categoriaId: 52, nombre: 'Computadoras', total: 26 }])).toEqual([
      { value: '', label: 'Todas las categorías' },
      { value: '52', label: 'Computadoras (26)' },
    ])
  })

  it('marcar y desmarcar sin duplicar', () => {
    expect(alternar([1, 2], 3, true)).toEqual([1, 2, 3])
    expect(alternar([1, 2], 2, true)).toEqual([1, 2])
    expect(alternar([1, 2], 1, false)).toEqual([2])
  })

  it('selección única: marcar uno sustituye al anterior', () => {
    expect(alternar([7], 9, true, false)).toEqual([9])
  })

  it('añadir varios conserva lo ya elegido (p. ej. de otra categoría) y no repite', () => {
    expect(agregar([1, 2, 3], [3, 4])).toEqual([1, 2, 3, 4])
  })
})
