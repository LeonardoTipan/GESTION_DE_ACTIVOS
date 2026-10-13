import { describe, expect, it } from 'vitest'
import { aConsultaApi, escribirFiltros, leerFiltros, TAMANO_PAGINA } from './filtros-url.ts'

describe('filtros del listado de activos en la URL', () => {
  it('URL vacía → valores por defecto', () => {
    expect(leerFiltros(new URLSearchParams())).toEqual({
      page: 1,
      q: '',
      categoriaId: undefined,
      criticidadId: undefined,
      cifrado: undefined,
      // El inventario muestra todos los equipos: activos y no activos.
      situacion: 'todos',
    })
  })

  it('lee todos los filtros', () => {
    const filtros = leerFiltros(
      new URLSearchParams(
        'q=servidor&categoriaId=2&criticidadId=4&cifrado=false&situacion=no_activos&page=3',
      ),
    )
    expect(filtros).toEqual({
      page: 3,
      q: 'servidor',
      categoriaId: 2,
      criticidadId: 4,
      cifrado: false,
      situacion: 'no_activos',
    })
  })

  it('ignora valores manipulados o inválidos', () => {
    const filtros = leerFiltros(
      new URLSearchParams(
        'page=-1&categoriaId=abc&criticidadId=1.5&cifrado=quizas&situacion=borrados',
      ),
    )
    expect(filtros).toMatchObject({
      page: 1,
      categoriaId: undefined,
      criticidadId: undefined,
      cifrado: undefined,
      situacion: 'todos',
    })
  })

  it('ida y vuelta: escribir y leer conserva los filtros', () => {
    const original = {
      page: 2,
      q: 'rack',
      categoriaId: 1,
      criticidadId: undefined,
      cifrado: true,
      situacion: 'activos' as const,
    }
    expect(leerFiltros(escribirFiltros(original))).toEqual(original)
  })

  it('no escribe valores vacíos ni la página 1', () => {
    expect(escribirFiltros({ page: 1, q: '', situacion: 'todos' }).toString()).toBe('')
    expect(escribirFiltros({ page: 1, q: '', situacion: 'no_activos' }).toString()).toBe(
      'situacion=no_activos',
    )
  })

  it('traduce a la consulta de la API con el tamaño de página', () => {
    expect(aConsultaApi({ page: 2, q: '', cifrado: false, situacion: 'todos' })).toEqual({
      // Se envía siempre: el valor por defecto de la API es "activos".
      situacion: 'todos',
      page: 2,
      limit: TAMANO_PAGINA,
      q: undefined,
      categoriaId: undefined,
      criticidadId: undefined,
      cifrado: false,
    })
  })
})
