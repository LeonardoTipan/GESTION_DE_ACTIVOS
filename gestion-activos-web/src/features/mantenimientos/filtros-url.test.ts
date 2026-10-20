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

  it('capa, categoría, búsqueda, técnico y cierre', () => {
    const filtros = leerFiltros(new URLSearchParams('capa=verificacion&categoriaId=3&q=%20pc%20&tecnico=jperez&cierre=CERRADO'))
    expect(filtros).toMatchObject({ capa: 'verificacion', categoriaId: 3, q: 'pc', tecnico: 'jperez', cierre: 'CERRADO' })
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros)
    expect(leerFiltros(new URLSearchParams('capa=otra&cierre=X'))).toMatchObject({ capa: undefined, cierre: undefined })
  })

  it('la pestaña de verificación muestra, por defecto, lo pendiente de verificar', () => {
    expect(aConsultaApi({ page: 1, capa: 'verificacion' }).cierre).toBe('PENDIENTE_VERIFICACION')
    expect(aConsultaApi({ page: 1 }).cierre).toBeUndefined()
  })
})
