import { describe, expect, it } from 'vitest'
import { accionesPermitidas, estadoPasos, pasoActivo, faltantesParaCerrar } from './fases.ts'

describe('acciones por fase', () => {
  it('programado: iniciar o cancelar', () => {
    expect(accionesPermitidas('PROGRAMADO')).toEqual(['iniciar', 'cancelar'])
  })

  it('en ejecución: finalizar o cancelar', () => {
    expect(accionesPermitidas('EN_EJECUCION')).toEqual(['finalizar', 'cancelar'])
  })

  it('las fases finales no admiten acciones', () => {
    expect(accionesPermitidas('FINALIZADO')).toEqual([])
    expect(accionesPermitidas('CANCELADO')).toEqual([])
  })
})

describe('pasos del Stepper de mantenimientos', () => {
  it('programado: paso activo = ejecución', () => {
    const pasos = estadoPasos({ fase: 'PROGRAMADO', fechaInicio: null })
    expect(pasos).toEqual(['completado', 'pendiente', 'pendiente'])
    expect(pasoActivo(pasos)).toBe(1)
  })

  it('finalizado: todo completado', () => {
    const pasos = estadoPasos({ fase: 'FINALIZADO', fechaInicio: '2026-10-01T10:00:00.000Z' })
    expect(pasoActivo(pasos)).toBe(3)
  })

  it('cancelado antes de iniciar: se marca el paso de ejecución', () => {
    const pasos = estadoPasos({ fase: 'CANCELADO', fechaInicio: null })
    expect(pasos).toEqual(['completado', 'cancelado', 'pendiente'])
    expect(pasoActivo(pasos)).toBe(1)
  })

  it('cancelado durante la ejecución: se marca el paso final', () => {
    const pasos = estadoPasos({ fase: 'CANCELADO', fechaInicio: '2026-10-01T10:00:00.000Z' })
    expect(pasos).toEqual(['completado', 'completado', 'cancelado'])
    expect(pasoActivo(pasos)).toBe(2)
  })
})

describe('cierre como operativo', () => {
  const completo = { tecnico: 'jperez', diagnostico: 'Fuente dañada', duracionMin: 30, resultado: 'Fuente reemplazada' }
  it('con la ejecución completa no falta nada', () => {
    expect(faltantesParaCerrar(completo)).toEqual([])
  })
  it('enumera lo que falta (una duración de 0 minutos sí cuenta)', () => {
    expect(faltantesParaCerrar({ ...completo, tecnico: null, duracionMin: null })).toEqual(['técnico', 'duración'])
    expect(faltantesParaCerrar({ ...completo, duracionMin: 0 })).toEqual([])
  })
})

describe('tipos por clase, semestre y repositorio', () => {
  it('tipos permitidos según la clase de la categoría', async () => {
    const { tiposPermitidos } = await import('./fases.ts')
    expect(tiposPermitidos('HARDWARE')).toEqual(['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'])
    expect(tiposPermitidos('SOFTWARE')).toEqual(['PREVENTIVO', 'CORRECTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO'])
    expect(tiposPermitidos(null)).toEqual(['PREVENTIVO', 'CORRECTIVO'])
  })

  it('semestre de un día local: S1 ene–jun, S2 jul–dic', async () => {
    const { etiquetaSemestre } = await import('./fases.ts')
    expect(etiquetaSemestre('2026-06-30')).toBe('S1-2026')
    expect(etiquetaSemestre('2026-07-01')).toBe('S2-2026')
  })

  it('repositorio: carpeta, ruta o URL http(s)', async () => {
    const { errorRepositorio } = await import('./fases.ts')
    expect(errorRepositorio('Carpeta Compartida TICs/Interno')).toBeNull()
    expect(errorRepositorio('C:\\Informes')).toBeNull()
    expect(errorRepositorio('https://intranet/informe.pdf')).toBeNull()
    expect(errorRepositorio('javascript:alert(1)')).toMatch(/http o https/)
  })
})
