import { describe, expect, it } from 'vitest'
import { situacionDe } from './situacion.ts'

const VIGENTE = { deletedAt: null, inactivoDesde: null, motivoInactivo: null }

describe('situación de un activo: Activo / No activo', () => {
  it('sin baja ni marca de la sincronización → Activo', () => {
    expect(situacionDe(VIGENTE)).toEqual({
      activo: true,
      etiqueta: 'Activo',
      motivo: null,
      desde: null,
    })
  })

  it('en la papelera de GLPI → No activo, con el motivo y la fecha', () => {
    expect(
      situacionDe({
        ...VIGENTE,
        inactivoDesde: '2026-10-13T15:00:00.000Z',
        motivoInactivo: 'PAPELERA_GLPI',
      }),
    ).toEqual({
      activo: false,
      etiqueta: 'No activo',
      motivo: 'Está en la papelera de GLPI',
      desde: '2026-10-13T15:00:00.000Z',
    })
  })

  it('eliminado definitivamente de GLPI → No activo', () => {
    const situacion = situacionDe({
      ...VIGENTE,
      inactivoDesde: '2026-10-13T15:00:00.000Z',
      motivoInactivo: 'AUSENTE_EN_GLPI',
    })
    expect(situacion).toMatchObject({ activo: false, motivo: 'Ya no existe en GLPI' })
  })

  it('dado de baja en la aplicación → No activo; prevalece sobre la marca de GLPI', () => {
    const situacion = situacionDe({
      deletedAt: '2026-10-10T12:00:00.000Z',
      inactivoDesde: '2026-10-13T15:00:00.000Z',
      motivoInactivo: 'PAPELERA_GLPI',
    })
    expect(situacion).toMatchObject({
      activo: false,
      motivo: 'Dado de baja en la aplicación',
      desde: '2026-10-10T12:00:00.000Z',
    })
  })

  it('un motivo desconocido no rompe la pantalla', () => {
    expect(
      situacionDe({ ...VIGENTE, inactivoDesde: '2026-10-13T15:00:00.000Z', motivoInactivo: 'OTRO' as never })
        .motivo,
    ).toBe('Marcado por la sincronización con GLPI')
  })
})
