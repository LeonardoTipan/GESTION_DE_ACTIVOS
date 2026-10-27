import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'
import { accionesPermitidas, faltantesCierre, textoDias } from './textos.ts'

describe('renovaciones: acciones y cierre', () => {
  it('transiciones: abierto → iniciar o cerrar; en progreso → cerrar; cerrado → reabrir (si no fue sustituido)', () => {
    expect(accionesPermitidas({ estado: 'ABIERTO', sustituidaPor: null })).toEqual(['iniciar', 'cerrar'])
    expect(accionesPermitidas({ estado: 'EN_PROGRESO', sustituidaPor: null })).toEqual(['cerrar'])
    expect(accionesPermitidas({ estado: 'CERRADO', sustituidaPor: null })).toEqual(['reabrir'])
    expect(accionesPermitidas({ estado: 'CERRADO', sustituidaPor: 7 })).toEqual([])
  })

  it('dice qué falta para cerrar', () => {
    const vacio = { fechaRenovacion: null, nuevaFechaCaducidad: null, nuevaSinCaducidad: false, evidencia: '', repositorioVerificable: ' ', observacion: '' }
    expect(faltantesCierre(vacio)).toEqual([
      'la fecha real de renovación',
      'la nueva fecha de caducidad (o marcar «sin caducidad»)',
      'el verificable',
      'el repositorio del verificable',
    ])
    expect(faltantesCierre({ ...vacio, fechaRenovacion: '2026-04-27', nuevaSinCaducidad: true, evidencia: 'Contrato', repositorioVerificable: 'Carpeta' })).toEqual([
      'la justificación de «sin caducidad» en la observación',
    ])
  })

  it('texto de los días restantes', () => {
    expect(textoDias(-3)).toBe('caducó hace 3 d')
    expect(textoDias(0)).toBe('caduca hoy')
    expect(textoDias(12)).toBe('caduca en 12 d')
  })
})

describe('renovaciones: filtros en la URL', () => {
  it('ida y vuelta; Ejecución pide por defecto lo pendiente', () => {
    const f = { page: 2, fase: 'ejecucion' as const, activoId: 3, tipo: 'LICENCIA' as const, vigencia: 'PROXIMA' as const, responsable: 'ANALISTA 1', caducaDesde: '2026-01-01', caducaHasta: '2026-12-31' }
    expect(leerFiltros(escribirFiltros(f))).toEqual(f)
    expect(aConsultaApi(f).pendientes).toBe(true)
    expect(aConsultaApi({ ...f, estado: 'CERRADO' }).pendientes).toBeUndefined()
    expect(aConsultaApi({ page: 1 }).pendientes).toBeUndefined()
  })

  it('ignora valores inválidos', () => {
    expect(leerFiltros(new URLSearchParams('tipo=DOMINIO&vigencia=ROJA&caducaDesde=ayer&fase=verificacion'))).toMatchObject({
      tipo: undefined,
      vigencia: undefined,
      caducaDesde: undefined,
      fase: undefined,
    })
  })
})
