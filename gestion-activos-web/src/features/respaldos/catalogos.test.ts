import { describe, expect, it } from 'vitest'
import { controlesEjecucion, FRECUENCIA, MEDIO, opciones, RETENCION, VENTANA } from './catalogos.ts'
import { fechaDeVentana, folio } from './folios.ts'

describe('catálogos de respaldos (textos del prototipo)', () => {
  it('cada valor de la API tiene su texto', () => {
    expect(MEDIO.CINTA_LTO8).toBe('Cinta LTO-8')
    expect(VENTANA.NOCTURNA_22_02).toBe('Nocturna 22:00–02:00')
    expect(RETENCION.ANIOS_7).toBe('7 años')
    expect(opciones(FRECUENCIA)).toEqual([
      { value: 'DIARIO', label: 'Diario' },
      { value: 'SEMANAL', label: 'Semanal' },
      { value: 'QUINCENAL', label: 'Quincenal' },
      { value: 'MENSUAL', label: 'Mensual' },
      { value: 'TRIMESTRAL', label: 'Trimestral' },
    ])
  })

  it('controles 3-2-1 visibles de una ejecución', () => {
    expect(controlesEjecucion({ cifrado: true, fueraSitio: false, inmutable: true, integridad: true })).toEqual([
      'Cifrado',
      'Inmutable',
      'Verificado',
    ])
    expect(controlesEjecucion({ cifrado: false, fueraSitio: false, inmutable: false, integridad: false })).toEqual([])
  })
})

describe('folios y fechas sugeridas', () => {
  it('folio con prefijo y cuatro cifras', () => {
    expect(folio('PLN', 3)).toBe('PLN-0003')
    expect(folio('RST', 12345)).toBe('RST-12345')
  })

  it('al pulsar una ventana se propone hoy, acotado a la ventana', () => {
    const w = { ini: '2026-09-01', fin: '2026-09-30' }
    expect(fechaDeVentana(w, '2026-09-15')).toBe('2026-09-15')
    expect(fechaDeVentana(w, '2026-10-14')).toBe('2026-09-30')
    expect(fechaDeVentana(w, '2026-08-20')).toBe('2026-09-01')
  })
})
