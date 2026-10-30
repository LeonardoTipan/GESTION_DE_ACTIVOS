import { describe, expect, it } from 'vitest'
import type { Indicadores } from './api.ts'
import { tarjetasDe } from './indicadores.ts'

const datos: Indicadores = {
  inventario: { total: 460, operativos: 455 },
  accesos: { abiertas: 1, enGestion: 2, cerradas: 3 },
  respaldos: { planesVigentes: 4, fallidas30Dias: 1, parciales30Dias: 0 },
  mantenimientos: { programados: 2, enEjecucion: 1, finalizados: 8, proximos30Dias: 3, planesVencidos: 1, ejecucionesVencidas: 0 },
  vulnerabilidades: { abiertas: 2, enProgreso: 1, remediadas: 5, vencidas: 1, criticasPendientes: 0 },
  renovaciones: { pendientes: 1, cerradas: 2, proximasAVencer: 3, caducadas: 1, diasAviso: 30 },
  endpoints: { abiertos: 1, enProgreso: 0, cerrados: 9 },
  evaluaciones: { abiertos: 1, enProgreso: 1, cerrados: 2, vencidas: 1 },
}

describe('indicadores del panel', () => {
  it('una tarjeta por módulo, con las cifras tal cual llegan de la API (sin recalcular)', () => {
    const tarjetas = tarjetasDe(datos)
    expect(tarjetas.map((t) => t.titulo)).toEqual([
      'Inventario', 'Mantenimientos', 'Respaldos', 'Vulnerabilidades', 'Renovaciones', 'Control de acceso', 'Protección de Endpoints', 'Evaluación de Sistemas',
    ])
    const valor = (titulo: string, etiqueta: string) => tarjetas.find((t) => t.titulo === titulo)!.lineas.find((l) => l.etiqueta.startsWith(etiqueta))!.valor
    expect(valor('Mantenimientos', 'Próximos 30 días')).toBe(3)
    expect(valor('Respaldos', 'Fallidos')).toBe(1)
    expect(valor('Renovaciones', 'Por vencer (30 días)')).toBe(3)
    expect(valor('Evaluación de Sistemas', 'Vencidas')).toBe(1)
  })

  it('las cifras que requieren atención están marcadas para resaltarse', () => {
    const respaldos = tarjetasDe(datos).find((t) => t.titulo === 'Respaldos')!
    expect(respaldos.lineas.find((l) => l.etiqueta.startsWith('Fallidos'))!.alerta).toBe('red')
  })
})
