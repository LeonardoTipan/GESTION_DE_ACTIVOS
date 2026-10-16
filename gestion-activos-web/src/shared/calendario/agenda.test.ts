import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { marcasDelDia, moverAncla, rangoDe, textoRol, type EventoAgenda } from './agenda.ts'

const evento = (inicio: string, fin: string | null, tipo: 'PREVISTO' | 'REAL' = 'PREVISTO'): EventoAgenda => ({
  clave: 'x', modulo: 'mantenimientos', capa: 1, tipo, titulo: 'X', inicio, fin, estado: 'PROGRAMADO',
  fueraDePlazo: false, responsable: null, ruta: '/x', detalle: null,
  activo: { id: 1, codigo: 'A', nombre: 'A', tipo: null, estado: null, criticidad: 'Media', categoria: 'C', categoriaId: 1 },
})

describe('calendario', () => {
  it('la vista mensual cubre semanas completas de lunes a domingo, también al cruzar de año', () => {
    const { desde, hasta } = rangoDe('mes', dayjs('2026-12-15'))
    expect(desde.format('YYYY-MM-DD')).toBe('2026-11-30')
    expect(hasta.format('YYYY-MM-DD')).toBe('2027-01-03')
    expect(moverAncla('mes', dayjs('2026-12-15'), 1).format('YYYY-MM')).toBe('2027-01')
  })

  it('la semana empieza el lunes; el día va de 00:00 a 23:59', () => {
    expect(rangoDe('semana', dayjs('2026-10-18')).desde.format('YYYY-MM-DD')).toBe('2026-10-12')
    const dia = rangoDe('dia', dayjs('2026-10-18T15:00'))
    expect([dia.desde.format('HH:mm'), dia.hasta.format('HH:mm')]).toEqual(['00:00', '23:59'])
  })

  it('un intervalo aparece en su inicio y en su límite (y en los días intermedios solo si se piden)', () => {
    const e = evento(dayjs('2026-12-30T08:00').toISOString(), dayjs('2027-01-02T18:00').toISOString())
    expect(marcasDelDia([e], dayjs('2026-12-30')).map((m) => m.rol)).toEqual(['inicio'])
    expect(marcasDelDia([e], dayjs('2027-01-02')).map((m) => m.rol)).toEqual(['limite'])
    expect(marcasDelDia([e], dayjs('2026-12-31'))).toEqual([])
    expect(marcasDelDia([e], dayjs('2026-12-31'), true).map((m) => m.rol)).toEqual(['continua'])
  })

  it('distingue lo previsto de lo real en las etiquetas', () => {
    const p = evento('2026-10-10T10:00:00Z', null)
    expect(textoRol(p, 'limite')).toBe('Límite')
    expect(textoRol({ ...p, tipo: 'REAL' }, 'limite')).toBe('Fin real')
  })
})
