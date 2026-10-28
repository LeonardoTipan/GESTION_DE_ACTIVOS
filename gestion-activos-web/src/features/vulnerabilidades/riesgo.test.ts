import { describe, expect, it } from 'vitest'
import type { Vulnerabilidad } from './api/vulnerabilidades.ts'
import { accionesPermitidas, clasificarPendientes, faltantesParaRemediar, FORMATO_CVE, semaforoSla } from './riesgo.ts'

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

describe('tablero de Detección', () => {
  const ahora = Date.parse('2026-10-28T12:00:00Z')
  const dia = 86_400_000
  const v = (id: number, fechaLimite: string | null) => ({ id, fechaLimite }) as Vulnerabilidad

  it('plazos de los próximos 60 días (vencidos incluidos y marcados), ordenados por fecha límite', () => {
    const { proximos } = clasificarPendientes(
      [v(1, new Date(ahora + 10 * dia).toISOString()), v(2, new Date(ahora - dia).toISOString()), v(3, new Date(ahora + 61 * dia).toISOString()), v(4, null)],
      ahora,
    )
    expect(proximos.map((p) => [p.v.id, p.vencido])).toEqual([
      [2, true],
      [1, false],
    ])
  })

  it('pendientes sin plazo: solo las que no tienen fecha límite', () => {
    expect(clasificarPendientes([v(1, null), v(2, new Date(ahora).toISOString()), v(3, null)], ahora).sinPlazo.map((x) => x.id)).toEqual([1, 3])
  })
})
