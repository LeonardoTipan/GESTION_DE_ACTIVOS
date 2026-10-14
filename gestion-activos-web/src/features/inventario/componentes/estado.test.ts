import { describe, expect, it } from 'vitest'
import { estadoDe } from './estado.ts'

const VIGENTE = { estado: 'Bueno', deletedAt: null, inactivoDesde: null, motivoInactivo: null }

describe('estado que se muestra de un activo', () => {
  it('vigente: el estado tal como lo informa GLPI', () => {
    expect(estadoDe(VIGENTE)).toEqual({ etiqueta: 'Bueno', baja: false, motivo: null, desde: null })
    expect(estadoDe({ ...VIGENTE, estado: 'Malo' }).etiqueta).toBe('Malo')
    expect(estadoDe({ ...VIGENTE, estado: null }).etiqueta).toBeNull()
    expect(estadoDe({ ...VIGENTE, estado: '  ' }).etiqueta).toBeNull()
  })

  it('en la papelera de GLPI: "Dado de baja", con el motivo y la fecha', () => {
    expect(
      estadoDe({ ...VIGENTE, inactivoDesde: '2026-10-13T15:00:00.000Z', motivoInactivo: 'PAPELERA_GLPI' }),
    ).toEqual({
      etiqueta: 'Dado de baja',
      baja: true,
      motivo: 'Está en la papelera de GLPI',
      desde: '2026-10-13T15:00:00.000Z',
    })
  })

  it('eliminado de GLPI o con un motivo desconocido', () => {
    expect(
      estadoDe({ ...VIGENTE, inactivoDesde: '2026-10-13T15:00:00.000Z', motivoInactivo: 'AUSENTE_EN_GLPI' }).motivo,
    ).toBe('Ya no existe en GLPI')
    expect(
      estadoDe({ ...VIGENTE, inactivoDesde: '2026-10-13T15:00:00.000Z', motivoInactivo: 'OTRO' as never }).motivo,
    ).toBe('Detectado por la sincronización con GLPI')
  })

  it('la baja manual prevalece sobre la marca de GLPI', () => {
    expect(
      estadoDe({
        estado: 'Bueno',
        deletedAt: '2026-10-10T12:00:00.000Z',
        inactivoDesde: '2026-10-13T15:00:00.000Z',
        motivoInactivo: 'PAPELERA_GLPI',
      }),
    ).toMatchObject({ baja: true, motivo: 'Dado de baja en la aplicación', desde: '2026-10-10T12:00:00.000Z' })
  })
})
