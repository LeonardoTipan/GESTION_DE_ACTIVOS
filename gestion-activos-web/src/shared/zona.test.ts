import { describe, expect, it } from 'vitest'
import { dentroDeVentana } from '../features/respaldos/folios.ts'
import { marcasDelDia, rangoDe, type EventoAgenda } from './calendario/agenda.ts'
import { fechaHoraLocalAIso, formatearDia, formatearFecha, formatearFechaHora, isoAFechaHoraLocal } from './formato.ts'
import { posicionEnPlazo } from './plazos/plazos.ts'
import { enZona, ZONA_HORARIA } from './zona.ts'

// Estas pruebas se ejecutan también con TZ=UTC y TZ=Asia/Tokyo: el resultado
// no depende de la zona del equipo, siempre es la hora de Guayaquil (UTC−5).
describe('hora de la institución (America/Guayaquil)', () => {
  it('es la zona por defecto', () => {
    expect(ZONA_HORARIA).toBe('America/Guayaquil')
  })

  it('un valor de formulario se entiende en hora de Guayaquil, y vuelve igual', () => {
    expect(fechaHoraLocalAIso('2026-10-16 22:30:00')).toBe('2026-10-17T03:30:00.000Z')
    expect(isoAFechaHoraLocal('2026-10-17T03:30:00.000Z')).toBe('2026-10-16 22:30:00')
  })

  it('se muestra la hora de Guayaquil; los días de calendario no cambian de día', () => {
    expect(formatearFechaHora('2026-10-17T03:30:00.000Z')).toMatch(/16 oct.* 2026.*22:30/)
    expect(formatearDia('2026-10-17T03:30:00.000Z')).toMatch(/^16 oct/)
    expect(formatearFecha('2026-10-01T00:00:00.000Z')).toMatch(/^01 oct/)
  })

  it('la ventana nocturna se evalúa en hora de Guayaquil', () => {
    expect(dentroDeVentana('NOCTURNA_22_02', '2026-10-17T03:30:00.000Z')).toBe(true) // 22:30
    expect(dentroDeVentana('NOCTURNA_22_02', '2026-10-17T00:00:00.000Z')).toBe(false) // 19:00
    expect(dentroDeVentana('NOCTURNA_22_02', '2026-10-16 22:30:00')).toBe(true)
  })

  it('un formulario y un ISO se comparan como el mismo instante', () => {
    expect(posicionEnPlazo('2026-10-16 22:30:00', '2026-10-17T03:30:00.000Z', null)).toBe('EN_PLAZO')
    expect(posicionEnPlazo('2026-10-16 22:29:00', '2026-10-17T03:30:00.000Z', null)).toBe('ANTES')
  })

  it('el calendario agrupa por el día de Guayaquil', () => {
    const evento = { inicio: '2026-10-17T03:30:00.000Z', fin: null } as EventoAgenda
    const dia16 = enZona('2026-10-16 00:00:00')
    expect(marcasDelDia([evento], dia16)).toHaveLength(1)
    expect(marcasDelDia([evento], dia16.add(1, 'day'))).toHaveLength(0)
    expect(marcasDelDia([evento], dia16)[0].hora.format('HH:mm')).toBe('22:30')
  })
})

describe('rango que el calendario pide a la API', () => {
  it('empieza y termina en la medianoche de Guayaquil', () => {
    const { desde, hasta } = rangoDe('mes', enZona('2026-10-16 12:00:00'))
    expect(desde.toISOString()).toBe('2026-09-28T05:00:00.000Z') // lunes 28 sept, 00:00 en Guayaquil
    expect(hasta.toISOString()).toBe('2026-11-02T04:59:59.999Z') // domingo 1 nov, 23:59:59.999
  })
})
