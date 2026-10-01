import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

describe('filtros de mantenimientos en la URL', () => {
  it('lee fase, tipo, activo y vencidos; ignora valores inventados', () => {
    expect(
      leerFiltros(new URLSearchParams('fase=PROGRAMADO&tipo=CORRECTIVO&activoId=5&vencidos=1')),
    ).toEqual({ page: 1, fase: 'PROGRAMADO', tipo: 'CORRECTIVO', activoId: 5, vencidos: true })
    const raro = leerFiltros(new URLSearchParams('fase=PAUSADO&tipo=X&vencidos=si'))
    expect(raro.fase).toBeUndefined()
    expect(raro.tipo).toBeUndefined()
    expect(raro.vencidos).toBeUndefined()
  })

  it('ida y vuelta', () => {
    const filtros = {
      page: 2,
      fase: 'EN_EJECUCION' as const,
      tipo: 'PREVENTIVO' as const,
      activoId: 7,
      vencidos: true,
    }
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros)
  })

  it('consulta de la API: fecha programada descendente', () => {
    expect(aConsultaApi({ page: 1, vencidos: true })).toMatchObject({
      page: 1,
      limit: 20,
      order: 'desc',
      vencidos: true,
    })
  })
})
