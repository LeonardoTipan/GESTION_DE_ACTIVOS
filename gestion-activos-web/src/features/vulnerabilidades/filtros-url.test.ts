import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

describe('filtros de vulnerabilidades en la URL', () => {
  it('por defecto: vista de pendientes', () => {
    const filtros = leerFiltros(new URLSearchParams())
    expect(filtros).toMatchObject({ page: 1, vista: 'pendientes', cve: '' })
    expect(aConsultaApi(filtros)).toMatchObject({ abiertas: true, limit: 20 })
  })

  it('ida y vuelta con todos los filtros', () => {
    const filtros = {
      page: 2,
      vista: 'todas' as const,
      nivelRiesgo: 'CRITICO' as const,
      estado: 'MITIGADA' as const,
      activoId: 4,
      cve: 'CVE-2026',
      vencidas: true,
    }
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros)
  })

  it('ignora un estado que no encaja con la vista', () => {
    expect(leerFiltros(new URLSearchParams('estado=MITIGADA')).estado).toBeUndefined()
    expect(leerFiltros(new URLSearchParams('vista=cerradas&estado=ABIERTA')).estado).toBeUndefined()
    expect(leerFiltros(new URLSearchParams('vista=cerradas&estado=ACEPTADA')).estado).toBe('ACEPTADA')
  })

  it('"vencidas" no aplica a las cerradas', () => {
    expect(leerFiltros(new URLSearchParams('vista=cerradas&vencidas=1')).vencidas).toBeUndefined()
  })

  it('cerradas → abiertas=false; todas → sin filtro', () => {
    expect(aConsultaApi(leerFiltros(new URLSearchParams('vista=cerradas'))).abiertas).toBe(false)
    expect(aConsultaApi(leerFiltros(new URLSearchParams('vista=todas'))).abiertas).toBeUndefined()
  })
})
