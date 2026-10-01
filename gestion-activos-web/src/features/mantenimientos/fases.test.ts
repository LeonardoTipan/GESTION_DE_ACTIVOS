import { describe, expect, it } from 'vitest'
import { accionesPermitidas, estadoPasos, pasoActivo } from './fases.ts'

describe('acciones por fase', () => {
  it('programado: iniciar o cancelar', () => {
    expect(accionesPermitidas('PROGRAMADO')).toEqual(['iniciar', 'cancelar'])
  })

  it('en ejecución: finalizar o cancelar', () => {
    expect(accionesPermitidas('EN_EJECUCION')).toEqual(['finalizar', 'cancelar'])
  })

  it('las fases finales no admiten acciones', () => {
    expect(accionesPermitidas('FINALIZADO')).toEqual([])
    expect(accionesPermitidas('CANCELADO')).toEqual([])
  })
})

describe('pasos del Stepper de mantenimientos', () => {
  it('programado: paso activo = ejecución', () => {
    const pasos = estadoPasos({ fase: 'PROGRAMADO', fechaInicio: null })
    expect(pasos).toEqual(['completado', 'pendiente', 'pendiente'])
    expect(pasoActivo(pasos)).toBe(1)
  })

  it('finalizado: todo completado', () => {
    const pasos = estadoPasos({ fase: 'FINALIZADO', fechaInicio: '2026-10-01T10:00:00.000Z' })
    expect(pasoActivo(pasos)).toBe(3)
  })

  it('cancelado antes de iniciar: se marca el paso de ejecución', () => {
    const pasos = estadoPasos({ fase: 'CANCELADO', fechaInicio: null })
    expect(pasos).toEqual(['completado', 'cancelado', 'pendiente'])
    expect(pasoActivo(pasos)).toBe(1)
  })

  it('cancelado durante la ejecución: se marca el paso final', () => {
    const pasos = estadoPasos({ fase: 'CANCELADO', fechaInicio: '2026-10-01T10:00:00.000Z' })
    expect(pasos).toEqual(['completado', 'completado', 'cancelado'])
    expect(pasoActivo(pasos)).toBe(2)
  })
})
