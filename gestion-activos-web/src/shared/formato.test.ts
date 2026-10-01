import { describe, expect, it } from 'vitest'
import { diaAIso, formatearFecha, isoADia } from './formato.ts'

describe('formato de fechas', () => {
  it('una fecha sin hora no cambia de día por la zona horaria', () => {
    // Medianoche UTC: en Ecuador (UTC-5) sería el día anterior si no se fija UTC.
    expect(formatearFecha('2026-09-15T00:00:00.000Z')).toMatch(/^15 /)
  })

  it('valores vacíos se muestran como guion', () => {
    expect(formatearFecha(null)).toBe('—')
  })

  it('convierte entre el valor del DateInput y el formato de la API', () => {
    expect(diaAIso('2026-09-15')).toBe('2026-09-15T00:00:00.000Z')
    expect(isoADia('2026-09-15T00:00:00.000Z')).toBe('2026-09-15')
  })
})
