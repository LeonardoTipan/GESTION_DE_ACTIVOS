import { describe, expect, it } from 'vitest';
import { bitacoraGeneral } from './calculo.js';
import { indicadorMantenimientos } from './indicador.js';

const Z = 'America/Guayaquil';
const d = (s: string) => new Date(`${s}T12:00:00-05:00`);

describe('Bitácora semestral de Mantenimientos con el contrato común', () => {
  it('traduce el cálculo existente sin cambiarlo: cumplidas ÷ (planificadas − suspendidas)', () => {
    const planes = [
      { id: 1, estado: 'VIGENTE' as const, fechaInicio: d('2026-02-01') },
      { id: 2, estado: 'VIGENTE' as const, fechaInicio: d('2026-03-01') },
      { id: 3, estado: 'SUSPENDIDO' as const, fechaInicio: d('2026-04-01') },
      { id: 4, estado: 'VIGENTE' as const, fechaInicio: d('2026-08-01') },
    ];
    const ejecuciones = [
      { planId: 1, fechaReal: d('2026-02-03') },
      { planId: 1, fechaReal: d('2026-02-20') },
      { planId: null, fechaReal: d('2026-05-05') },
    ];
    const r = bitacoraGeneral(2026, [1, 2], planes, ejecuciones, Z);
    const b = indicadorMantenimientos(2026, r.semestres, new Date('2026-11-06T12:00:00Z'), Z);
    expect(b.indicador).toMatchObject({ frecuencia: 'SEMESTRAL', formula: 'Mantenimientos ejecutados en la infraestructura tecnológica / Total Planificados' });
    expect(b.periodos.map((p) => [p.etiqueta, p.numerador, p.denominador, p.porcentaje])).toEqual([
      ['S1 · ene–jun', 1, 2, 50],
      ['S2 · jul–dic', 0, 1, 0],
    ]);
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores;
    expect(inf('Planificadas (con suspendidas)')).toEqual([3, 1]);
    expect(inf('Suspendidas sin ejecución')).toEqual([1, 0]);
    expect(inf('Ejecuciones finalizadas (fecha real)')).toEqual([3, 0]);
    expect(inf('De ellas, sin planificación')).toEqual([1, 0]);
  });
});
