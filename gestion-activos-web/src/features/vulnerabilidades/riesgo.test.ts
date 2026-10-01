import { describe, expect, it } from 'vitest'
import {
  accionesPermitidas,
  FORMATO_CVE,
  pasoActivo,
  pasosCiclo,
  semaforoSla,
} from './riesgo.ts'

const AHORA = new Date('2026-10-01T12:00:00.000Z')
const enDias = (d: number) => new Date(AHORA.getTime() + d * 24 * 60 * 60 * 1000).toISOString()

describe('acciones por estado', () => {
  it('abierta: iniciar mitigación o aceptar riesgo', () => {
    expect(accionesPermitidas('ABIERTA')).toEqual(['iniciar-mitigacion', 'aceptar-riesgo'])
  })

  it('en mitigación: mitigar o aceptar riesgo', () => {
    expect(accionesPermitidas('EN_MITIGACION')).toEqual(['mitigar', 'aceptar-riesgo'])
  })

  it('mitigada y aceptada son finales', () => {
    expect(accionesPermitidas('MITIGADA')).toEqual([])
    expect(accionesPermitidas('ACEPTADA')).toEqual([])
  })
})

describe('semáforo SLA', () => {
  const pendiente = (fechaLimite: string | null) =>
    semaforoSla({ estado: 'ABIERTA', fechaLimite, fechaCierre: null }, AHORA)

  it('rojo si ya venció', () => {
    expect(pendiente(enDias(-2))).toMatchObject({ tipo: 'vencida', color: 'red', etiqueta: 'Vencida hace 2 d' })
  })

  it('amarillo si vence en 3 días o menos', () => {
    expect(pendiente(enDias(3))).toMatchObject({ tipo: 'por-vencer', color: 'yellow' })
    expect(pendiente(enDias(0.5)).etiqueta).toBe('Vence en 1 d')
  })

  it('verde si queda más margen', () => {
    expect(pendiente(enDias(10))).toMatchObject({ tipo: 'en-plazo', color: 'green' })
  })

  it('gris sin fecha límite', () => {
    expect(pendiente(null).tipo).toBe('sin-plazo')
  })

  it('cerrada: compara el cierre con el plazo', () => {
    expect(
      semaforoSla({ estado: 'MITIGADA', fechaLimite: enDias(0), fechaCierre: enDias(-1) }, AHORA)
        .tipo,
    ).toBe('cerrada-en-plazo')
    expect(
      semaforoSla({ estado: 'ACEPTADA', fechaLimite: enDias(-5), fechaCierre: enDias(0) }, AHORA)
        .tipo,
    ).toBe('cerrada-fuera')
  })

  it('una cerrada nunca sale como vencida aunque su plazo haya pasado', () => {
    expect(
      semaforoSla({ estado: 'MITIGADA', fechaLimite: enDias(-5), fechaCierre: enDias(-6) }, AHORA)
        .tipo,
    ).toBe('cerrada-en-plazo')
  })
})

describe('pasos del ciclo', () => {
  it('abierta → en mitigación → mitigada', () => {
    expect(pasoActivo(pasosCiclo('ABIERTA'))).toBe(1)
    expect(pasoActivo(pasosCiclo('EN_MITIGACION'))).toBe(2)
    expect(pasoActivo(pasosCiclo('MITIGADA'))).toBe(3)
  })

  it('riesgo aceptado: dos pasos, ambos cerrados', () => {
    const pasos = pasosCiclo('ACEPTADA')
    expect(pasos.map((p) => p.clave)).toEqual(['abierta', 'aceptada'])
    expect(pasoActivo(pasos)).toBe(2)
  })
})

describe('formato CVE', () => {
  it('acepta el formato oficial y rechaza el resto', () => {
    expect(FORMATO_CVE.test('CVE-2026-12345')).toBe(true)
    expect(FORMATO_CVE.test('CVE-2026-123')).toBe(false)
    expect(FORMATO_CVE.test('cve-2026-12345')).toBe(false)
  })
})
