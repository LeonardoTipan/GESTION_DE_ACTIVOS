import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { evaluarPlazo, exigirIntervalo, horaLocal, plazoOExcepcion } from './plazos.js';

const d = (s: string) => new Date(s);
const admin = { id: '1', username: 'admin.test', roles: ['admin' as const] };
const analista = { id: '2', username: 'analista.test', roles: ['analista' as const] };
const MOTIVO = 'El equipo estuvo en uso continuo durante la ventana prevista.';

describe('plazos', () => {
  const inicio = d('2026-10-10T13:00:00Z');
  const limite = d('2026-10-12T22:00:00Z');

  it('evalúa la fecha real contra el intervalo previsto', () => {
    expect(evaluarPlazo(d('2026-10-11T00:00:00Z'), inicio, limite)).toBe('EN_PLAZO');
    expect(evaluarPlazo(d('2026-10-09T23:59:00Z'), inicio, limite)).toBe('ANTES');
    expect(evaluarPlazo(d('2026-10-12T22:01:00Z'), inicio, limite)).toBe('DESPUES');
    expect(evaluarPlazo(d('2026-10-11T00:00:00Z'), null, null)).toBe('SIN_PLAZO');
  });

  it('el límite no puede ser anterior al inicio', () => {
    expect(() => exigirIntervalo(limite, inicio, 'Mantenimiento')).toThrow(BadRequestException);
    expect(() => exigirIntervalo(inicio, limite, 'Mantenimiento')).not.toThrow();
  });

  it('en plazo no hay excepción; fuera, 409 sin justificación', () => {
    expect(plazoOExcepcion({ real: d('2026-10-11T00:00:00Z'), inicio, limite, que: 'x' }).fueraDePlazo).toBe(false);
    expect(() => plazoOExcepcion({ real: d('2026-10-13T00:00:00Z'), inicio, limite, que: 'La ejecución' })).toThrow(
      ConflictException,
    );
  });

  it('la excepción la registra solo un admin, con justificación suficiente', () => {
    const fuera = { real: d('2026-10-13T00:00:00Z'), inicio, limite, que: 'La ejecución' };
    expect(() => plazoOExcepcion({ ...fuera, motivoExcepcion: MOTIVO, usuario: analista })).toThrow(ForbiddenException);
    expect(() => plazoOExcepcion({ ...fuera, motivoExcepcion: 'corto', usuario: admin })).toThrow(BadRequestException);
    expect(plazoOExcepcion({ ...fuera, motivoExcepcion: MOTIVO, usuario: admin })).toEqual({
      fueraDePlazo: true,
      motivoExcepcion: MOTIVO,
      excepcionPor: 'admin.test',
    });
  });

  it('hora local en la zona de la institución (Guayaquil, UTC−5), incluso al cruzar de día y de año', () => {
    expect(horaLocal(d('2027-01-01T03:30:00Z'), 'America/Guayaquil')).toEqual({ diaSemana: 4, minutos: 22 * 60 + 30 });
  });
});
