import { proximaIntervencion, siguienteFecha } from './frecuencia.js';

const Z = 'America/Guayaquil';
/** Un instante a partir de la hora LOCAL de Ecuador (UTC−5, sin horario de verano). */
const ec = (diaHora: string) => new Date(`${diaHora}-05:00`);

describe('siguienteFecha (calendario local de Ecuador)', () => {
  it('los ejemplos de la regla: fin real 15/01/2027 → mensual, trimestral, semestral y anual', () => {
    const fin = ec('2027-01-15T16:30:00');
    expect(siguienteFecha(fin, 'MENSUAL', Z)).toEqual(ec('2027-02-15T16:30:00'));
    expect(siguienteFecha(fin, 'TRIMESTRAL', Z)).toEqual(ec('2027-04-15T16:30:00'));
    expect(siguienteFecha(fin, 'SEMESTRAL', Z)).toEqual(ec('2027-07-15T16:30:00'));
    expect(siguienteFecha(fin, 'ANUAL', Z)).toEqual(ec('2028-01-15T16:30:00'));
    expect(siguienteFecha(fin, 'UNICA', Z)).toBeNull();
  });

  it('fin de mes y febrero: 31 de enero → 28 de febrero (29 en bisiesto)', () => {
    expect(siguienteFecha(ec('2027-01-31T10:00:00'), 'MENSUAL', Z)).toEqual(ec('2027-02-28T10:00:00'));
    expect(siguienteFecha(ec('2028-01-31T10:00:00'), 'MENSUAL', Z)).toEqual(ec('2028-02-29T10:00:00'));
    expect(siguienteFecha(ec('2028-02-29T10:00:00'), 'ANUAL', Z)).toEqual(ec('2029-02-28T10:00:00'));
    expect(siguienteFecha(ec('2027-08-31T10:00:00'), 'SEMESTRAL', Z)).toEqual(ec('2028-02-29T10:00:00'));
  });

  it('conserva los segundos y milisegundos del fin real (no los redondea al minuto)', () => {
    expect(siguienteFecha(new Date('2026-10-28T20:18:07.512Z'), 'TRIMESTRAL', Z)).toEqual(new Date('2027-01-28T20:18:07.512Z'));
  });

  it('cambio de año', () => {
    expect(siguienteFecha(ec('2027-11-30T09:00:00'), 'TRIMESTRAL', Z)).toEqual(ec('2028-02-29T09:00:00'));
    expect(siguienteFecha(ec('2027-12-15T09:00:00'), 'MENSUAL', Z)).toEqual(ec('2028-01-15T09:00:00'));
  });

  it('de noche en Ecuador (ya es otro día en UTC) no se desplaza de día ni de mes', () => {
    // 31/01 a las 22:00 en Quito = 01/02 03:00 UTC: el siguiente mensual es el 28/02 a las 22:00 local.
    const fin = ec('2027-01-31T22:00:00');
    expect(fin.toISOString()).toBe('2027-02-01T03:00:00.000Z');
    expect(siguienteFecha(fin, 'MENSUAL', Z)).toEqual(ec('2027-02-28T22:00:00'));
  });
});

describe('proximaIntervencion (derivada del historial de ejecuciones)', () => {
  const plan = { fechaInicio: ec('2027-01-05T08:00:00'), frecuencia: 'TRIMESTRAL' as const };
  const fin = (f: string, extra: object = {}) => ({ fase: 'FINALIZADO', fechaFin: ec(f), anuladoEn: null, ...extra });

  it('sin ejecuciones finalizadas: la fecha de inicio planificada', () => {
    expect(proximaIntervencion(plan, [], Z)).toEqual({ proximaFecha: plan.fechaInicio, ultimaFinalizacion: null });
    // Una programada, en curso o cancelada no la mueve.
    const otras = [
      { fase: 'PROGRAMADO', fechaFin: null, anuladoEn: null },
      { fase: 'EN_EJECUCION', fechaFin: null, anuladoEn: null },
      { fase: 'CANCELADO', fechaFin: null, anuladoEn: null },
    ];
    expect(proximaIntervencion(plan, otras, Z).proximaFecha).toEqual(plan.fechaInicio);
  });

  it('el ejemplo de la regla: inicio real 12/01, fin real 15/01/2027, trimestral → 15/04/2027', () => {
    expect(proximaIntervencion(plan, [fin('2027-01-15T17:00:00')], Z)).toEqual({
      proximaFecha: ec('2027-04-15T17:00:00'),
      ultimaFinalizacion: ec('2027-01-15T17:00:00'),
    });
  });

  it('cuenta la ÚLTIMA finalización real; las anuladas no cuentan', () => {
    const ejecuciones = [fin('2027-01-15T17:00:00'), fin('2027-04-20T10:00:00'), fin('2027-07-30T10:00:00', { anuladoEn: new Date() })];
    expect(proximaIntervencion(plan, ejecuciones, Z).proximaFecha).toEqual(ec('2027-07-20T10:00:00'));
  });

  it('ÚNICA: ya finalizada, no hay próxima intervención', () => {
    expect(proximaIntervencion({ ...plan, frecuencia: 'UNICA' }, [fin('2027-01-15T17:00:00')], Z).proximaFecha).toBeNull();
  });
});
