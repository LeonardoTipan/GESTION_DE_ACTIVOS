import { describe, expect, it } from 'vitest'
import type { EntradaHistorial } from './api.ts'
import { atencionesAnteriores, destino, nombreCampo, solicitante, TIPO_SOLICITUD, valorLegible } from './textos.ts'

describe('control de acceso: textos', () => {
  it('el destino es el activo o, si no hay, el recurso', () => {
    expect(destino({ activo: { id: 1, codigo: 'GLPI-PC-29', nombre: 'VM-CONTABILIDAD' } as never, recurso: null })).toBe('GLPI-PC-29 · VM-CONTABILIDAD')
    expect(destino({ activo: null, recurso: 'Correo institucional' })).toBe('Correo institucional')
  })

  it('ALTA y BAJA con su nombre completo', () => {
    expect(TIPO_SOLICITUD.ACCESO).toMatchObject({ corto: 'ALTA', etiqueta: 'Otorgamiento de acceso' })
    expect(TIPO_SOLICITUD.BAJA).toMatchObject({ corto: 'BAJA', etiqueta: 'Desvinculación de acceso' })
    expect(valorLegible('tipoSolicitud', 'BAJA')).toBe('BAJA · Desvinculación de acceso')
  })

  it('el solicitante de una solicitud antigua no se inventa', () => {
    expect(solicitante({ nombreSolicitante: null, cargoSolicitante: null })).toEqual({ nombre: 'No registrado', cargo: null })
    expect(solicitante({ nombreSolicitante: 'Ana Torres', cargoSolicitante: 'Jefa TIC' })).toEqual({ nombre: 'Ana Torres', cargo: 'Jefa TIC' })
  })

  it('el historial se muestra legible (fechas en hora de Guayaquil), incluida la fecha deseada retirada', () => {
    expect(nombreCampo('fechaAtendido')).toBe('Fecha atendida')
    expect(nombreCampo('fechaAccesoDeseada')).toBe('Fecha deseada (campo retirado)')
    expect(valorLegible('estado', 'PENDIENTE')).toBe('Pendiente')
    expect(valorLegible('fechaAtendido', '2026-10-21T03:30:00.000Z')).toMatch(/20 oct.*22:30/)
    expect(valorLegible('recurso', null)).toBe('—')
  })

  it('las atenciones anteriores se reconstruyen del historial al reabrir', () => {
    const e = (campo: string, valorAnterior: string | null, valorNuevo: string | null, fecha: string, motivo: string | null = null): EntradaHistorial =>
      ({ id: 0, campo, valorAnterior, valorNuevo, usuario: 'admin.test', fecha, motivo }) as EntradaHistorial
    const reapertura = '2026-10-21T15:00:00.000Z'
    const atenciones = atencionesAnteriores([
      e('fechaAtendido', null, '2026-10-20T14:00:00.000Z', '2026-10-20T14:05:00.000Z'),
      e('resolucion', null, 'Cuenta creada.', '2026-10-20T14:05:00.000Z'),
      e('fechaAtendido', '2026-10-20T14:00:00.000Z', null, reapertura, 'No puede iniciar sesión.'),
      e('resolucion', 'Cuenta creada.', null, reapertura, 'No puede iniciar sesión.'),
    ])
    expect(atenciones).toEqual([
      { fechaAtendido: '2026-10-20T14:00:00.000Z', resolucion: 'Cuenta creada.', reabiertaEl: reapertura, reabiertaPor: 'admin.test', motivo: 'No puede iniciar sesión.' },
    ])
  })
})
