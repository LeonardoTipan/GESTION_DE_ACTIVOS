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

describe('acciones por etapa', () => {
  const v = (estado: 'ABIERTA' | 'EN_MITIGACION' | 'MITIGADA' | 'ACEPTADA', confirmada = false, evaluada = false) => ({
    estado,
    confirmadaEn: confirmada ? '2026-10-01T00:00:00Z' : null,
    evaluadaEn: evaluada ? '2026-10-02T00:00:00Z' : null,
  })

  it('detectada: confirmar (o aceptar el riesgo); sin evaluación no hay tratamiento', () => {
    expect(accionesPermitidas(v('ABIERTA'))).toEqual(['confirmar', 'aceptar-riesgo'])
    expect(accionesPermitidas(v('ABIERTA', true))).toEqual(['evaluar', 'aceptar-riesgo'])
    expect(accionesPermitidas(v('ABIERTA', true, true))).toEqual(['evaluar', 'iniciar-mitigacion', 'aceptar-riesgo'])
  })

  it('en tratamiento: acciones, verificación, reevaluar o aceptar riesgo; nunca cerrar a mano', () => {
    expect(accionesPermitidas(v('EN_MITIGACION', true, true))).toEqual(['registrar-accion', 'verificar', 'evaluar', 'aceptar-riesgo'])
  })

  it('mitigada: solo una verificación (que puede reabrirla); aceptada es final', () => {
    expect(accionesPermitidas(v('MITIGADA', true, true))).toEqual(['verificar'])
    expect(accionesPermitidas(v('ACEPTADA'))).toEqual([])
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
  const base = { confirmadaEn: '2026-10-01T00:00:00Z', evaluadaEn: '2026-10-02T00:00:00Z' }
  it('detectada → confirmada → evaluada → tratamiento → cerrada', () => {
    expect(pasoActivo(pasosCiclo({ estado: 'ABIERTA', confirmadaEn: null, evaluadaEn: null }))).toBe(1)
    expect(pasoActivo(pasosCiclo({ estado: 'ABIERTA', confirmadaEn: base.confirmadaEn, evaluadaEn: null }))).toBe(2)
    expect(pasoActivo(pasosCiclo({ estado: 'ABIERTA', ...base }))).toBe(3)
    expect(pasoActivo(pasosCiclo({ estado: 'EN_MITIGACION', ...base }))).toBe(4)
    expect(pasoActivo(pasosCiclo({ estado: 'MITIGADA', ...base }))).toBe(5)
  })

  it('riesgo aceptado: solo los pasos que se dieron', () => {
    const pasos = pasosCiclo({ estado: 'ACEPTADA', confirmadaEn: base.confirmadaEn, evaluadaEn: null })
    expect(pasos.map((p) => p.clave)).toEqual(['detectada', 'confirmada', 'aceptada'])
    expect(pasoActivo(pasos)).toBe(3)
  })
})

describe('formato CVE', () => {
  it('acepta el formato oficial y rechaza el resto', () => {
    expect(FORMATO_CVE.test('CVE-2026-12345')).toBe(true)
    expect(FORMATO_CVE.test('CVE-2026-123')).toBe(false)
    expect(FORMATO_CVE.test('cve-2026-12345')).toBe(false)
  })
})
