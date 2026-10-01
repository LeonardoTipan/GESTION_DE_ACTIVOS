import { describe, expect, it } from 'vitest'
import { cambiosLegibles, formatearValor } from './bitacora-formato.ts'

const nombres = {
  categorias: new Map([
    [1, 'Hardware'],
    [2, 'Software'],
  ]),
  criticidades: new Map([[3, 'Alta']]),
}

describe('formato de la bitácora', () => {
  it('traduce ids de catálogo a sus nombres', () => {
    expect(formatearValor('categoriaId', 2, nombres)).toBe('Software')
    expect(formatearValor('criticidadId', 3, nombres)).toBe('Alta')
  })

  it('un catálogo eliminado se muestra con su id', () => {
    expect(formatearValor('categoriaId', 99, nombres)).toBe('#99')
  })

  it('booleanos, vacíos y fechas legibles', () => {
    expect(formatearValor('cifrado', true, nombres)).toBe('Sí')
    expect(formatearValor('cifrado', false, nombres)).toBe('No')
    expect(formatearValor('deletedAt', null, nombres)).toBe('—')
    expect(formatearValor('ultimaRevision', '2026-09-15T00:00:00.000Z', nombres)).toMatch(/^15 /)
  })

  it('convierte el detalle completo en filas con etiquetas en español', () => {
    expect(
      cambiosLegibles(
        {
          ubicacion: { antes: 'Rack 3', despues: 'Rack 7' },
          categoriaId: { antes: 1, despues: 2 },
        },
        nombres,
      ),
    ).toEqual([
      { campo: 'Ubicación', antes: 'Rack 3', despues: 'Rack 7' },
      { campo: 'Categoría', antes: 'Hardware', despues: 'Software' },
    ])
  })
})
