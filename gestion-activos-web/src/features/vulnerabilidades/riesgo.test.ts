import { describe, expect, it } from 'vitest'
import { accionesPermitidas, faltantesParaRemediar, FORMATO_CVE, semaforoSla } from './riesgo.ts'

describe('acciones por estado (dos fases)', () => {
  it('ABIERTO: iniciar o remediar · EN_PROGRESO: remediar · REMEDIADO: reabrir', () => {
    expect(accionesPermitidas('ABIERTO')).toEqual(['iniciar', 'remediar'])
    expect(accionesPermitidas('EN_PROGRESO')).toEqual(['remediar'])
    expect(accionesPermitidas('REMEDIADO')).toEqual(['reabrir'])
  })

  it('para remediar faltan fecha, verificable y repositorio', () => {
    expect(faltantesParaRemediar({ fechaRemediacion: null, evidencia: ' ', repositorioVerificable: '' })).toEqual([
      'la fecha de remediación',
      'el verificable',
      'el repositorio del verificable',
    ])
    expect(faltantesParaRemediar({ fechaRemediacion: '2026-04-27 10:00:00', evidencia: 'Informe 01', repositorioVerificable: 'Carpeta X' })).toEqual([])
  })
})

describe('semáforo del plazo', () => {
  const ahora = new Date('2026-04-20T12:00:00Z')
  const pendiente = { estado: 'ABIERTO' as const, fechaRemediacion: null }

  it('pendiente: vencida, por vencer, en plazo o sin plazo', () => {
    expect(semaforoSla({ ...pendiente, fechaLimite: '2026-04-18T00:00:00Z' }, ahora).tipo).toBe('vencida')
    expect(semaforoSla({ ...pendiente, fechaLimite: '2026-04-22T00:00:00Z' }, ahora).tipo).toBe('por-vencer')
    expect(semaforoSla({ ...pendiente, fechaLimite: '2026-05-30T00:00:00Z' }, ahora).tipo).toBe('en-plazo')
    expect(semaforoSla({ ...pendiente, fechaLimite: null }, ahora).tipo).toBe('sin-plazo')
  })

  it('remediada: compara la fecha REAL de remediación con el plazo; nunca sale como vencida', () => {
    const remediada = { estado: 'REMEDIADO' as const, fechaLimite: '2026-04-30T00:00:00Z' }
    expect(semaforoSla({ ...remediada, fechaRemediacion: '2026-04-27T15:00:00Z' }, ahora).tipo).toBe('remediada-en-plazo')
    expect(semaforoSla({ ...remediada, fechaRemediacion: '2026-05-02T15:00:00Z' }, new Date('2026-06-01T00:00:00Z')).tipo).toBe('remediada-fuera')
  })
})

describe('formato CVE', () => {
  it('acepta el formato oficial y rechaza el resto', () => {
    expect(FORMATO_CVE.test('CVE-2026-12345')).toBe(true)
    expect(FORMATO_CVE.test('CVE-26-1')).toBe(false)
  })
})
