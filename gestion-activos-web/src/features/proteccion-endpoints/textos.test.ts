import { describe, expect, it } from 'vitest'
import { mesesDelAnio, mesesSinAbrir, nombrePeriodo } from './textos.ts'

describe('Protección de Endpoints · calendario de períodos', () => {
  const hoy = { anio: 2026, mes: 10 }

  it('cada mes muestra el estado de su período real, «sin abrir» o «futuro»', () => {
    const meses = mesesDelAnio(
      [
        { anio: 2026, mes: 9, estado: 'CERRADO' },
        { anio: 2026, mes: 10, estado: 'ABIERTO' },
        { anio: 2025, mes: 11, estado: 'ABIERTO' }, // de otro año: no cuenta
      ],
      2026,
      hoy,
    )
    expect(meses).toHaveLength(12)
    expect(meses[8]).toEqual({ mes: 9, situacion: 'CERRADO' })
    expect(meses[9]).toEqual({ mes: 10, situacion: 'ABIERTO' })
    expect(meses[10]).toEqual({ mes: 11, situacion: 'FUTURO' })
    expect(meses[0]).toEqual({ mes: 1, situacion: 'SIN_ABRIR' })
  })

  it('meses sin abrir: solo los ya transcurridos sin período (nada inventado)', () => {
    expect(mesesSinAbrir(mesesDelAnio([], 2026, hoy))).toBe(10)
    expect(mesesSinAbrir(mesesDelAnio([{ anio: 2026, mes: 10, estado: 'ABIERTO' }], 2026, hoy))).toBe(9)
    // Un año pasado entero: los 12 meses ya transcurrieron.
    expect(mesesSinAbrir(mesesDelAnio([], 2025, hoy))).toBe(12)
  })

  it('nombre legible del período', () => {
    expect(nombrePeriodo(2026, 10)).toBe('Octubre 2026')
  })
})
