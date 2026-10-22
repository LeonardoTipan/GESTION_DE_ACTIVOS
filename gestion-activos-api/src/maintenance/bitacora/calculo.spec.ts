import { bitacoraGeneral } from './calculo.js';

const Z = 'America/Guayaquil';
const d = (s: string) => new Date(`${s}T15:00:00Z`);

describe('Bitácora General', () => {
  const planes = [
    { id: 1, estado: 'VIGENTE' as const, fechaInicio: d('2026-02-10') }, // S1, dos ejecuciones completadas
    { id: 2, estado: 'VIGENTE' as const, fechaInicio: d('2026-06-20') }, // S1, ejecutada en julio
    { id: 3, estado: 'VIGENTE' as const, fechaInicio: d('2026-03-01') }, // S1, pendiente
    { id: 4, estado: 'SUSPENDIDO' as const, fechaInicio: d('2026-04-01') }, // S1, suspendida sin ejecución
    { id: 5, estado: 'SUSPENDIDO' as const, fechaInicio: d('2026-05-01') }, // S1, suspendida pero ya cumplida
    { id: 6, estado: 'VIGENTE' as const, fechaInicio: d('2026-09-01') }, // S2, pendiente
  ];
  const ejecuciones = [
    { planId: 1, fechaReal: d('2026-02-12') },
    { planId: 1, fechaReal: d('2026-02-20') },
    { planId: 2, fechaReal: d('2026-07-03') },
    { planId: 5, fechaReal: d('2026-05-02') },
    { planId: null, fechaReal: d('2026-08-01') },
  ];

  it('cuenta cada planificación una vez, en su semestre planificado', () => {
    const { semestres, total } = bitacoraGeneral(2026, [1, 2], planes, ejecuciones, Z);
    const [s1, s2] = semestres;
    expect(s1).toMatchObject({
      periodo: { anio: 2026, semestre: 1, etiqueta: 'S1-2026' },
      planificadas: 5,
      suspendidas: 1,
      esperadas: 4,
      cumplidas: 3, // la 1 (dos ejecuciones = una), la 2 (ejecutada en julio) y la 5
      pendientes: 1,
      ejecucionesCompletadas: 3, // por semestre REAL: dos de la 1 y la de la 5
      ejecucionesSinPlanificacion: 0,
      cumplimiento: 75,
    });
    expect(s2).toMatchObject({
      planificadas: 1,
      cumplidas: 0,
      pendientes: 1,
      ejecucionesCompletadas: 2, // la de julio (plan 2, S1 planificado) y la sin planificación
      ejecucionesSinPlanificacion: 1,
      cumplimiento: 0,
    });
    expect(total).toMatchObject({
      periodo: { anio: 2026, semestre: null, etiqueta: '2026' },
      planificadas: 6,
      esperadas: 5,
      cumplidas: 3,
      pendientes: 2,
      ejecucionesCompletadas: 5,
      cumplimiento: 60,
    });
  });

  it('un solo semestre y sin planificaciones: cumplimiento null, no división por cero', () => {
    const { semestres, total } = bitacoraGeneral(2027, [1], [], [], Z);
    expect(semestres).toHaveLength(1);
    expect(total).toMatchObject({ periodo: { semestre: 1, etiqueta: 'S1-2027' }, esperadas: 0, cumplimiento: null });
  });
});
