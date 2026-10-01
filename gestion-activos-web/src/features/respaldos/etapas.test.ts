import { describe, expect, it } from 'vitest'
import { estadoPasos, pasoActivo } from './etapas.ts'

describe('pasos del Stepper de respaldos', () => {
  it('recién creado: alcance hecho, ejecución pendiente, prueba bloqueada', () => {
    const pasos = estadoPasos({ estadoEjecucion: 'PENDIENTE', estadoPrueba: 'PENDIENTE' })
    expect(pasos).toEqual(['completado', 'pendiente', 'bloqueado'])
    expect(pasoActivo(pasos)).toBe(1)
  })

  it('ejecución fallida: la prueba queda bloqueada', () => {
    expect(estadoPasos({ estadoEjecucion: 'FALLIDA', estadoPrueba: 'PENDIENTE' })).toEqual([
      'completado',
      'fallido',
      'bloqueado',
    ])
  })

  it('ejecución exitosa: la prueba pasa a pendiente', () => {
    const pasos = estadoPasos({ estadoEjecucion: 'EXITOSA', estadoPrueba: 'PENDIENTE' })
    expect(pasos).toEqual(['completado', 'completado', 'pendiente'])
    expect(pasoActivo(pasos)).toBe(2)
  })

  it('prueba fallida y completado', () => {
    expect(estadoPasos({ estadoEjecucion: 'EXITOSA', estadoPrueba: 'FALLIDA' })[2]).toBe('fallido')
    const completo = estadoPasos({ estadoEjecucion: 'EXITOSA', estadoPrueba: 'APROBADA' })
    expect(completo).toEqual(['completado', 'completado', 'completado'])
    expect(pasoActivo(completo)).toBe(3)
  })
})
