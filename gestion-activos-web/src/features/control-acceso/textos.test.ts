import { describe, expect, it } from 'vitest'
import { destino, nombreCampo, valorLegible } from './textos.ts'

describe('control de acceso: textos', () => {
  it('el destino es el activo o, si no hay, el recurso', () => {
    expect(destino({ activo: { id: 1, codigo: 'GLPI-PC-29', nombre: 'VM-CONTABILIDAD' } as never, recurso: null })).toBe('GLPI-PC-29 · VM-CONTABILIDAD')
    expect(destino({ activo: null, recurso: 'Correo institucional' })).toBe('Correo institucional')
  })

  it('el historial se muestra legible (fechas en hora de Guayaquil)', () => {
    expect(nombreCampo('fechaAtendido')).toBe('Fecha de atención')
    expect(valorLegible('estado', 'PENDIENTE')).toBe('Pendiente')
    expect(valorLegible('tipoAcceso', 'FISICO')).toBe('Físico')
    expect(valorLegible('fechaAtendido', '2026-10-21T03:30:00.000Z')).toMatch(/20 oct.*22:30/)
    expect(valorLegible('recurso', null)).toBe('—')
  })
})
