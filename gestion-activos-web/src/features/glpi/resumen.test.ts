import { describe, expect, it } from 'vitest'
import type { EstadoSincronizacion, ResultadoSincronizacion } from './api/sincronizacion.ts'
import {
  mensajeDeAviso,
  puedeSincronizar,
  resumenSincronizacion,
  textoUltimaSincronizacion,
} from './resumen.ts'

const CEROS = {
  leidos: 0,
  creados: 0,
  actualizados: 0,
  sinCambios: 0,
  inactivados: 0,
  reactivados: 0,
  omitidos: 0,
  errores: 0,
  porRevisar: 0,
  detectados: 0,
  aplicados: 0,
}

const resultado = (extra: Partial<ResultadoSincronizacion> = {}): ResultadoSincronizacion => ({
  id: 7,
  origen: 'MANUAL',
  modo: 'INCREMENTAL',
  estado: 'EXITOSA',
  solicitadaPor: 'admin.test',
  inicio: '2026-10-13T15:00:00.000Z',
  fin: '2026-10-13T15:00:02.000Z',
  desde: '2026-10-13T14:45:00.000Z',
  puntoControlAvanzado: true,
  errores: [],
  cambios: [],
  contadores: CEROS,
  ...extra,
})

const estado = (extra: Partial<EstadoSincronizacion> = {}): EstadoSincronizacion => ({
  configurado: true,
  enCurso: false,
  ultimaExitosa: '2026-10-13T15:00:02.000Z',
  ultima: null,
  ...extra,
})

describe('resumen que se muestra tras pulsar "Sincronizar con GLPI"', () => {
  it('sin nada que hacer: lo dice claramente', () => {
    expect(resumenSincronizacion(resultado())).toEqual({
      color: 'green',
      titulo: 'El inventario ya estaba al día',
      lineas: [],
    })
  })

  it('distingue altas, modificaciones, bajas detectadas y reactivaciones', () => {
    const resumen = resumenSincronizacion(
      resultado({
        contadores: {
          ...CEROS,
          leidos: 6,
          creados: 1,
          actualizados: 2,
          inactivados: 1,
          reactivados: 1,
          sinCambios: 1,
          porRevisar: 3,
          detectados: 5,
          aplicados: 5,
        },
      }),
    )
    expect(resumen.color).toBe('green')
    expect(resumen.titulo).toBe('Sincronización completada: 5 cambios aplicados')
    expect(resumen.lineas).toEqual([
      '1 activo nuevo',
      '2 actualizados',
      '1 dado de baja',
      '1 reactivado',
      '1 sin cambios',
      '3 para revisión manual',
    ])
  })

  it('con errores parciales: separa lo detectado de lo aplicado y avisa de que se reintentará', () => {
    const resumen = resumenSincronizacion(
      resultado({
        estado: 'CON_ERRORES',
        puntoControlAvanzado: false,
        contadores: { ...CEROS, leidos: 2, actualizados: 1, errores: 1, detectados: 2, aplicados: 1 },
      }),
    )
    expect(resumen.color).toBe('orange')
    expect(resumen.titulo).toBe('Sincronización terminada con errores')
    expect(resumen.lineas).toContain('1 de 2 cambios detectados se aplicaron')
    expect(resumen.lineas.at(-1)).toContain('se reintentará')
  })

  it('si GLPI no responde: fallo en rojo', () => {
    const resumen = resumenSincronizacion(
      resultado({ estado: 'FALLIDA', contadores: { ...CEROS, errores: 1 } }),
    )
    expect(resumen).toMatchObject({ color: 'red', titulo: 'No se pudo sincronizar con GLPI' })
  })
})

describe('estado del botón y texto de la última sincronización', () => {
  it('se puede pulsar solo si GLPI está configurado y no hay otra ejecución', () => {
    expect(puedeSincronizar(estado())).toBe(true)
    expect(puedeSincronizar(estado({ enCurso: true }))).toBe(false)
    expect(puedeSincronizar(estado({ configurado: false }))).toBe(false)
    expect(puedeSincronizar(undefined)).toBe(false) // aún cargando
  })

  it('informa de cuándo fue la última sincronización exitosa', () => {
    expect(textoUltimaSincronizacion(estado())).toMatch(/^Última sincronización: .*2026/)
    expect(textoUltimaSincronizacion(estado({ ultimaExitosa: null }))).toBe(
      'Aún no se ha sincronizado con GLPI',
    )
    expect(textoUltimaSincronizacion(estado({ enCurso: true }))).toBe(
      'Hay una sincronización en curso…',
    )
    expect(textoUltimaSincronizacion(estado({ configurado: false }))).toBe(
      'GLPI no está configurado en el servidor',
    )
    expect(textoUltimaSincronizacion(undefined)).toBe('')
  })

  it('si el último intento falló, lo señala sin ocultar la última exitosa', () => {
    const texto = textoUltimaSincronizacion(
      estado({
        ultima: {
          id: 9,
          origen: 'AUTOMATICA',
          modo: 'INCREMENTAL',
          estado: 'FALLIDA',
          solicitadaPor: null,
          inicio: '2026-10-13T16:00:00.000Z',
          fin: '2026-10-13T16:00:01.000Z',
          contadores: CEROS,
        },
      }),
    )
    expect(texto).toMatch(/^Última sincronización: .* · el último intento falló$/)
  })
})

describe('avisos', () => {
  it('solo los errores de sincronización llevan mensaje', () => {
    expect(
      mensajeDeAviso({ tipo: 'ERROR_SINCRONIZACION', detalle: { mensaje: 'GLPI respondió 500' } }),
    ).toBe('GLPI respondió 500')
    expect(
      mensajeDeAviso({ tipo: 'CAMBIO_ESTADO', detalle: { estado: { antes: 'Bueno', despues: 'Malo' } } }),
    ).toBeNull()
  })
})
