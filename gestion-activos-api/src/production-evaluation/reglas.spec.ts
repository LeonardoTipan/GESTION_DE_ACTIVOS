import { bitacoraGeneral, type EvaluacionBitacora } from './bitacora.js';
import { esTardia, exigirCierre, exigirCoherencia, situacion, type DatosEjecucionEvaluacion } from './reglas.js';
import { rangoDe, semestreDe } from './semestres.js';

const Z = 'America/Guayaquil';
const AHORA = new Date('2026-10-29T17:00:00Z');
const programada = new Date('2026-10-20T15:00:00Z');

const completo: DatosEjecucionEvaluacion = {
  fechaProgramadaProduccion: programada,
  fechaPruebas: new Date('2026-10-18T14:00:00Z'),
  evidencia: 'Informe de pruebas de seguridad v2.1.pdf',
  repositorioVerificable: 'Carpeta Compartida TICs/Seguridad',
  observacion: null,
};

describe('Evaluación de Sistemas Productivos · reglas de la fase 2', () => {
  it('tardía: pruebas posteriores a la fecha programada (la misma hora no lo es)', () => {
    expect(esTardia(new Date('2026-10-20T15:00:01Z'), programada)).toBe(true);
    expect(esTardia(programada, programada)).toBe(false);
    expect(esTardia(null, programada)).toBe(false);
  });

  it('la fecha real de las pruebas no puede ser futura (margen de 5 minutos)', () => {
    expect(() => exigirCoherencia({ ...completo, fechaPruebas: new Date('2026-10-29T17:04:00Z') }, AHORA)).not.toThrow();
    expect(() => exigirCoherencia({ ...completo, fechaPruebas: new Date('2026-10-30T10:00:00Z') }, AHORA)).toThrow('no puede ser futura');
  });

  it('cerrar exige fecha real, informe y repositorio, y dice qué falta', () => {
    expect(() => exigirCierre(completo, AHORA)).not.toThrow();
    expect(() => exigirCierre({ ...completo, fechaPruebas: null, evidencia: '', repositorioVerificable: null }, AHORA)).toThrow(
      'Para cerrar la evaluación falta: la fecha real de las pruebas de seguridad, el verificable (informe de las pruebas), el repositorio del verificable.',
    );
    expect(() => exigirCierre({ ...completo, repositorioVerificable: 'file:///c:/informe.pdf' }, AHORA)).toThrow('http o https');
  });

  it('pruebas tardías: se permite cerrar, pero con la observación justificada (≥ 20 caracteres)', () => {
    const tarde = { ...completo, fechaPruebas: new Date('2026-10-25T14:00:00Z') };
    expect(() => exigirCierre(tarde, AHORA)).toThrow('posteriores a la fecha programada');
    expect(() => exigirCierre({ ...tarde, observacion: 'Se retrasó.' }, AHORA)).toThrow('al menos 20');
    expect(() => exigirCierre({ ...tarde, observacion: 'El proveedor entregó la versión tarde; se probó el 25/10.' }, AHORA)).not.toThrow();
  });

  it('situación: pendiente, vencida, cumplida y cumplida tarde', () => {
    const base = { fechaProgramadaProduccion: programada, fechaPruebas: null };
    expect(situacion({ ...base, estado: 'ABIERTO', fechaProgramadaProduccion: new Date('2026-12-01T15:00:00Z') }, AHORA)).toBe('PENDIENTE');
    expect(situacion({ ...base, estado: 'EN_PROGRESO' }, AHORA)).toBe('VENCIDA');
    expect(situacion({ ...base, estado: 'CERRADO', fechaPruebas: completo.fechaPruebas }, AHORA)).toBe('CUMPLIDA');
    expect(situacion({ ...base, estado: 'CERRADO', fechaPruebas: new Date('2026-10-21T10:00:00Z') }, AHORA)).toBe('CUMPLIDA_TARDE');
  });
});

describe('Semestres en la hora de la institución', () => {
  it('el 30/06 a las 20:00 de Guayaquil (01/07 en UTC) sigue en S1', () => {
    expect(semestreDe(new Date('2026-07-01T01:00:00Z'), Z)).toEqual({ anio: 2026, semestre: 1, etiqueta: 'S1-2026' });
    expect(semestreDe(new Date('2026-07-01T05:00:00Z'), Z).semestre).toBe(2);
  });

  it('rango [desde, hasta) del semestre y del año', () => {
    expect(rangoDe(2026, 1, Z)).toEqual({ desde: new Date('2026-01-01T05:00:00Z'), hasta: new Date('2026-07-01T05:00:00Z') });
    expect(rangoDe(2026, undefined, Z)).toEqual({ desde: new Date('2026-01-01T05:00:00Z'), hasta: new Date('2027-01-01T05:00:00Z') });
  });
});

describe('Bitácora General de Evaluación', () => {
  const e = (estado: EvaluacionBitacora['estado'], prog: string, pruebas: string | null = null): EvaluacionBitacora => ({
    estado,
    fechaProgramadaProduccion: new Date(prog),
    fechaPruebas: pruebas ? new Date(pruebas) : null,
  });
  const evaluaciones = [
    e('CERRADO', '2026-03-10T15:00:00Z', '2026-03-05T15:00:00Z'), // S1, a tiempo
    e('CERRADO', '2026-05-10T15:00:00Z', '2026-07-15T15:00:00Z'), // S1 planificada, tarde: pruebas en S2
    e('ABIERTO', '2026-06-01T15:00:00Z'), // S1, vencida
    e('EN_PROGRESO', '2026-09-01T15:00:00Z'), // S2, vencida
    e('ABIERTO', '2026-12-15T15:00:00Z'), // S2, pendiente en plazo
    e('CERRADO', '2025-12-20T15:00:00Z', '2026-01-10T15:00:00Z'), // planificada en 2025; pruebas en S1-2026
  ];

  it('cada evaluación cuenta una vez en su semestre planificado; las cerradas, también en su semestre real', () => {
    const { semestres, total } = bitacoraGeneral(2026, [1, 2], evaluaciones, AHORA, Z);
    const [s1, s2] = semestres;
    expect(s1).toEqual({
      periodo: { anio: 2026, semestre: 1, etiqueta: 'S1-2026' },
      planificadas: 3,
      cumplidas: 2,
      cumplidasATiempo: 1,
      cumplidasTarde: 1,
      pendientes: 1,
      vencidas: 1,
      cerradasEnElSemestre: 2, // la de marzo y la planificada en 2025
      cumplimiento: 66.7,
    });
    expect(s2).toMatchObject({ planificadas: 2, cumplidas: 0, pendientes: 2, vencidas: 1, cerradasEnElSemestre: 1, cumplimiento: 0 });
    expect(total).toMatchObject({ periodo: { anio: 2026, semestre: null, etiqueta: '2026' }, planificadas: 5, cumplidas: 2, pendientes: 3, cerradasEnElSemestre: 3, cumplimiento: 40 });
  });

  it('un solo semestre; sin planificadas no hay porcentaje (null, no 0)', () => {
    const { semestres, total } = bitacoraGeneral(2027, [1], evaluaciones, AHORA, Z);
    expect(semestres).toHaveLength(1);
    expect(total).toMatchObject({ periodo: { anio: 2027, semestre: 1, etiqueta: 'S1-2027' }, planificadas: 0, cumplimiento: null });
  });
});
