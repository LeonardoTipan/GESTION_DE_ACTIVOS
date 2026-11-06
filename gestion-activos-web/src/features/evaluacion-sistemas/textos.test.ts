import { describe, expect, it } from 'vitest'
import { pestanaDe, periodoPlanificado, resumenParaCerrarEvaluacion } from './textos.ts'

describe('Evaluación de Sistemas · pestañas, período y cierre', () => {
  it('la pestaña sale de la URL; un valor desconocido es Planificación', () => {
    expect(pestanaDe('ejecucion')).toBe('ejecucion')
    expect(pestanaDe('bitacora')).toBe('bitacora')
    expect(pestanaDe(null)).toBe('planificacion')
    expect(pestanaDe('otra')).toBe('planificacion')
  })

  it('mes y semestre de la fecha planificada, en la hora de Ecuador (no en UTC)', () => {
    expect(periodoPlanificado({ fechaProgramadaProduccion: '2026-03-15T17:00:00.000Z' })).toBe('Marzo 2026 · S1-2026')
    // 1 de julio a las 02:00 UTC = 30 de junio a las 21:00 en Guayaquil: sigue siendo junio (S1).
    expect(periodoPlanificado({ fechaProgramadaProduccion: '2026-07-01T02:00:00.000Z' })).toBe('Junio 2026 · S1-2026')
  })

  const completa = {
    activo: { codigo: 'APL-1' } as never,
    fechaPruebas: '2026-10-30T15:00:00.000Z',
    responsableEjecucion: 'Seguridad TIC',
    evidencia: 'Informe.pdf',
    repositorioVerificable: 'Carpeta Compartida TICs/Seguridad',
    tardia: false,
    observacion: null,
  }

  it('«Cerrar» se ofrece solo con fecha real, responsable de la ejecución, informe y repositorio', () => {
    expect(resumenParaCerrarEvaluacion(completa)).toMatchObject({ codigo: 'APL-1', tardia: false })
    expect(resumenParaCerrarEvaluacion({ ...completa, fechaPruebas: null })).toBeNull()
    expect(resumenParaCerrarEvaluacion({ ...completa, responsableEjecucion: '  ' })).toBeNull()
    expect(resumenParaCerrarEvaluacion({ ...completa, evidencia: null })).toBeNull()
    expect(resumenParaCerrarEvaluacion({ ...completa, repositorioVerificable: '' })).toBeNull()
  })

  it('tardía: exige la justificación del retraso (20 caracteres o más)', () => {
    expect(resumenParaCerrarEvaluacion({ ...completa, tardia: true, observacion: 'Se retrasó.' })).toBeNull()
    expect(resumenParaCerrarEvaluacion({ ...completa, tardia: true, observacion: 'El proveedor entregó la versión tarde.' })).not.toBeNull()
  })
})
