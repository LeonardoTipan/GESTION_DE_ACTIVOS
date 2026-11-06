import { describe, expect, it } from 'vitest'
import { cambiosDeEquipos, conteoEquipos, mesesDelAnio, mesesSinAbrir, nombrePeriodo, pestanaDe, resumenParaCerrar, ultimoCierre } from './textos.ts'

describe('Protección de Endpoints · detalle por equipo', () => {
  it('los totales se calculan de las marcas; los sin registrar se cuentan aparte', () => {
    expect(conteoEquipos({ 1: true, 2: false, 3: null, 4: true })).toEqual({ total: 4, con: 2, sin: 1, sinRegistrar: 1 })
    expect(conteoEquipos({})).toEqual({ total: 0, con: 0, sin: 0, sinRegistrar: 0 })
  })

  it('solo se envían los equipos que cambiaron (y nunca un «sin registrar»)', () => {
    expect(cambiosDeEquipos({ 1: true, 2: null, 3: false }, { 1: true, 2: false, 3: true })).toEqual([
      { activoId: 2, conAntivirus: false },
      { activoId: 3, conAntivirus: true },
    ])
    expect(cambiosDeEquipos({ 1: null }, { 1: null })).toEqual([])
  })

  it('con equipos sin registrar no se ofrece «Cerrar»', () => {
    const base = { anio: 2026, mes: 10, totalActivos: 3, equiposConAntivirus: 2, fechaEjecucion: '2026-10-30T15:00:00.000Z', responsableEjecucion: 'X', evidencia: 'E', repositorioVerificable: 'R' }
    expect(resumenParaCerrar({ ...base, equiposSinRegistrar: 1 })).toBeNull()
    expect(resumenParaCerrar({ ...base, equiposSinRegistrar: 0 })).not.toBeNull()
    expect(resumenParaCerrar({ ...base, equiposSinRegistrar: null })).not.toBeNull()
  })
})

describe('Protección de Endpoints · pestañas y cierre', () => {
  it('la pestaña sale de la URL; un valor desconocido es Planificación', () => {
    expect(pestanaDe('ejecucion')).toBe('ejecucion')
    expect(pestanaDe('bitacora')).toBe('bitacora')
    expect(pestanaDe(null)).toBe('planificacion')
    expect(pestanaDe('otra')).toBe('planificacion')
  })

  const completo = {
    anio: 2026,
    mes: 10,
    totalActivos: 26,
    equiposConAntivirus: 25,
    fechaEjecucion: '2026-10-30T15:00:00.000Z',
    responsableEjecucion: 'Soporte TIC',
    evidencia: 'Inventario.xlsx',
    repositorioVerificable: 'Carpeta Compartida TICs',
  }

  it('«Cerrar» se ofrece solo con todos los datos guardados y coherentes', () => {
    expect(resumenParaCerrar(completo)).toMatchObject({ totalActivos: 26, equiposConAntivirus: 25 })
    expect(resumenParaCerrar({ ...completo, totalActivos: null })).toBeNull()
    expect(resumenParaCerrar({ ...completo, equiposConAntivirus: null })).toBeNull()
    expect(resumenParaCerrar({ ...completo, equiposConAntivirus: 27 })).toBeNull()
    expect(resumenParaCerrar({ ...completo, fechaEjecucion: null })).toBeNull()
    expect(resumenParaCerrar({ ...completo, responsableEjecucion: '  ' })).toBeNull()
    expect(resumenParaCerrar({ ...completo, evidencia: '' })).toBeNull()
    expect(resumenParaCerrar({ ...completo, repositorioVerificable: null })).toBeNull()
  })

  it('un período con cero equipos con antivirus también se puede cerrar', () => {
    expect(resumenParaCerrar({ ...completo, equiposConAntivirus: 0 })).not.toBeNull()
  })

  it('la fecha de cierre es la del cierre más reciente de la auditoría', () => {
    const trazas = [
      { fecha: '2026-11-03T10:00:00Z', cambios: [{ campo: 'estado', antes: 'EN_PROGRESO', despues: 'CERRADO' }] },
      { fecha: '2026-11-02T10:00:00Z', cambios: [{ campo: 'estado', antes: 'CERRADO', despues: 'EN_PROGRESO' }] },
      { fecha: '2026-11-01T10:00:00Z', cambios: [{ campo: 'estado', antes: 'ABIERTO', despues: 'CERRADO' }] },
    ]
    expect(ultimoCierre(trazas)).toBe('2026-11-03T10:00:00Z')
    expect(ultimoCierre([])).toBeNull()
  })
})

describe('Protección de Endpoints · calendario de períodos', () => {
  const hoy = { anio: 2026, mes: 10 }

  it('cada mes muestra el estado de su período real, «sin abrir» o «futuro»', () => {
    const meses = mesesDelAnio(
      [
        { anio: 2026, mes: 9, estado: 'CERRADO' },
        { anio: 2026, mes: 10, estado: 'ABIERTO' },
        { anio: 2025, mes: 11, estado: 'ABIERTO' }, // de otro año: no cuenta
      ],
      2026,
      hoy,
    )
    expect(meses).toHaveLength(12)
    expect(meses[8]).toEqual({ mes: 9, situacion: 'CERRADO' })
    expect(meses[9]).toEqual({ mes: 10, situacion: 'ABIERTO' })
    expect(meses[10]).toEqual({ mes: 11, situacion: 'FUTURO' })
    expect(meses[0]).toEqual({ mes: 1, situacion: 'SIN_ABRIR' })
  })

  it('meses sin abrir: solo los ya transcurridos sin período (nada inventado)', () => {
    expect(mesesSinAbrir(mesesDelAnio([], 2026, hoy))).toBe(10)
    expect(mesesSinAbrir(mesesDelAnio([{ anio: 2026, mes: 10, estado: 'ABIERTO' }], 2026, hoy))).toBe(9)
    // Un año pasado entero: los 12 meses ya transcurrieron.
    expect(mesesSinAbrir(mesesDelAnio([], 2025, hoy))).toBe(12)
  })

  it('nombre legible del período', () => {
    expect(nombrePeriodo(2026, 10)).toBe('Octubre 2026')
  })
})
