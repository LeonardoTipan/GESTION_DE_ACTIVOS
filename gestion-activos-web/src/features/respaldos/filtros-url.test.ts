import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

describe('filtros de respaldos en la URL', () => {
  it('lee etapa y activo; ignora una etapa inventada', () => {
    expect(leerFiltros(new URLSearchParams('etapa=PENDIENTE_PRUEBA&activoId=5&page=2'))).toEqual({
      page: 2,
      etapa: 'PENDIENTE_PRUEBA',
      activoId: 5,
    })
    expect(leerFiltros(new URLSearchParams('etapa=TERMINADO')).etapa).toBeUndefined()
  })

  it('ida y vuelta', () => {
    const filtros = { page: 3, etapa: 'COMPLETADO' as const, activoId: 7 }
    expect(leerFiltros(escribirFiltros(filtros))).toEqual(filtros)
  })

  it('consulta de la API con tamaño de página', () => {
    expect(aConsultaApi({ page: 1, etapa: 'EJECUCION_FALLIDA' })).toMatchObject({
      page: 1,
      limit: 20,
      etapa: 'EJECUCION_FALLIDA',
    })
  })
})
