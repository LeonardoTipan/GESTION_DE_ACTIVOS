import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

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

  it('Remediación muestra por defecto lo pendiente; con un estado, ese estado', () => {
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion'))).abiertas).toBe(true)
    expect(aConsultaApi(leerFiltros(new URLSearchParams('fase=remediacion&estado=REMEDIADO')))).toMatchObject({ abiertas: undefined, estado: 'REMEDIADO' })
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
