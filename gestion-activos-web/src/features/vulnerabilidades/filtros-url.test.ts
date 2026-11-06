import { describe, expect, it } from 'vitest'
import { aConsultaApi, aConsultaBitacora, escribirFiltros, leerFiltros } from './filtros-url.ts'

describe('filtros de vulnerabilidades en la URL', () => {
  it('por defecto: pestaña Detección, todo el registro', () => {
    const filtros = leerFiltros(new URLSearchParams())
    expect(filtros).toMatchObject({ page: 1, fase: undefined })
    expect(aConsultaApi(filtros)).toMatchObject({ limit: 20, abiertas: undefined })
  })

  it('ida y vuelta con todos los filtros', () => {
    const filtros = {
      page: 2,
      fase: 'remediacion' as const,
      nivelRiesgo: 'CRITICO' as const,
      estado: 'REMEDIADO' as const,
      activoId: 4,
      categoriaId: 3,
      responsable: 'ANALISTA 1',
      desde: '2026-01-01',
      hasta: '2026-06-30',
      q: 'CVE-2026',
      vencidas: true,
    }
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros)
  })

  // Cambio aprobado el 06/11/2026: en Remediación manda el selector Pendientes | Remediadas | Todas.
  it('Remediación: pendientes por defecto, remediadas o todas según la vista', () => {
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion')))).toMatchObject({ abiertas: true, estado: undefined })
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion&vista=remediadas')))).toMatchObject({ abiertas: undefined, estado: 'REMEDIADO' })
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion&vista=todas')))).toMatchObject({ abiertas: undefined, estado: undefined })
    // El estado elegido en Detección no filtra la vista de Remediación.
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion&estado=ABIERTO')))).toMatchObject({ abiertas: true, estado: undefined })
    expect(aConsultaApi(leerFiltros(new URLSearchParams('estado=REMEDIADO')))).toMatchObject({ abiertas: undefined, estado: 'REMEDIADO' })
  })

  it('Bitácora: año y trimestre en la URL; sin año, el actual', () => {
    const f = leerFiltros(new URLSearchParams('fase=bitacora&anio=2025&trimestre=3&estado=REMEDIADO'))
    expect(f).toMatchObject({ fase: 'bitacora', anio: 2025, trimestre: 3 })
    expect(aConsultaBitacora(f, 2026)).toMatchObject({ anio: 2025, trimestre: 3, estado: 'REMEDIADO', limit: 20 })
    expect(aConsultaBitacora(leerFiltros(new URLSearchParams('fase=bitacora&trimestre=9')), 2026)).toMatchObject({ anio: 2026, trimestre: undefined })
    expect(escribirFiltros(f).toString()).toBe('fase=bitacora&anio=2025&trimestre=3&estado=REMEDIADO')
  })

  it('el rango son días completos en la hora de Guayaquil (UTC−5)', () => {
    const api = aConsultaApi(leerFiltros(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31')))
    expect(api.desde).toBe('2026-01-01T05:00:00.000Z')
    expect(api.hasta).toBe('2026-02-01T04:59:59.000Z')
  })

  it('ignora valores inválidos y la antigua fase de verificación', () => {
    expect(leerFiltros(new URLSearchParams('estado=MITIGADA&fase=verificacion&desde=ayer'))).toMatchObject({ estado: undefined, fase: undefined, desde: undefined })
  })
})
