import { describe, expect, it } from 'vitest';
import { enProduccion, indicadorEvaluacion, type EvaluacionIndicador, type SistemaProduccion } from './indicador.js';

const Z = 'America/Guayaquil';
const AHORA = new Date('2026-11-06T17:00:00Z');
const d = (s: string) => new Date(`${s}T12:00:00-05:00`);
const sis = (id: number, alta: string, baja: string | null = null): SistemaProduccion => ({ id, alta: d(alta), baja: baja ? d(baja) : null });
const ev = (activoId: number, estado: string, programada: string, pruebas: string | null = null): EvaluacionIndicador => ({ activoId, estado, fechaProgramadaProduccion: d(programada), fechaPruebas: pruebas ? d(pruebas) : null });

describe('Bitácora semestral de Evaluación (pruebas ejecutadas ÷ total de sistemas en producción)', () => {
  const sistemas = [sis(1, '2025-01-01'), sis(2, '2025-06-01'), sis(3, '2026-03-01'), sis(4, '2026-08-01'), sis(5, '2025-01-01', '2026-05-01')];

  it('el total es el inventario de producción al corte del semestre (o hoy, si está en curso)', () => {
    expect(enProduccion(sistemas, d('2026-07-01')).map((s) => s.id)).toEqual([1, 2, 3]);
    const b = indicadorEvaluacion(2026, sistemas, [], AHORA, Z);
    expect(b.indicador).toMatchObject({ frecuencia: 'SEMESTRAL', formula: 'Pruebas de seguridad ejecutadas (sistemas productivos) / Total sistemas en producción' });
    expect(b.periodos.map((p) => p.denominador)).toEqual([3, 4]);
    expect(b.periodos.map((p) => p.porcentaje)).toEqual([0, 0]);
  });

  it('cuenta sistemas distintos con evaluación CERRADA por la fecha real de pruebas; planificadas y en progreso no', () => {
    const b = indicadorEvaluacion(
      2026,
      sistemas,
      [
        ev(1, 'CERRADO', '2026-02-01', '2026-02-10'),
        ev(1, 'CERRADO', '2026-04-01', '2026-04-02'),
        ev(2, 'EN_PROGRESO', '2026-03-01'),
        ev(3, 'CERRADO', '2026-06-20', '2026-07-05'),
        ev(4, 'ABIERTO', '2026-09-01'),
      ],
      AHORA,
      Z,
    );
    expect(b.periodos[0]).toMatchObject({ numerador: 1, denominador: 3, porcentaje: 33.3 });
    expect(b.periodos[1]).toMatchObject({ numerador: 1, denominador: 4, porcentaje: 25 });
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores;
    expect(inf('Evaluaciones cerradas en el semestre')).toEqual([2, 1]);
    expect(inf('Evaluaciones planificadas en el semestre')).toEqual([4, 1]);
    expect(inf('Planificadas sin ejecutar')).toEqual([1, 1]);
  });

  it('un sistema dado de baja antes del corte no entra en la fórmula aunque se haya evaluado', () => {
    const b = indicadorEvaluacion(2026, sistemas, [ev(5, 'CERRADO', '2026-02-01', '2026-02-05')], AHORA, Z);
    expect(b.periodos[0]).toMatchObject({ numerador: 0, denominador: 3 });
    expect(b.informativas.find((f) => f.etiqueta === 'Sistemas evaluados fuera del inventario de producción')!.valores[0]).toBe(1);
  });

  it('sin sistemas en producción: N/D', () => {
    const b = indicadorEvaluacion(2026, [], [], AHORA, Z);
    expect(b.periodos[0]).toMatchObject({ denominador: 0, porcentaje: null });
  });
});
