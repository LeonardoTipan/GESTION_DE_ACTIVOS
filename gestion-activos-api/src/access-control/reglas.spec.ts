import { cambiosAuditables, codigoDe, puedeTransitar, situacionDe } from './reglas.js';

describe('control de acceso: reglas', () => {
  it('códigos con correlativo por tipo y al menos tres cifras', () => {
    expect(codigoDe('LOGICO', 1)).toBe('CAL-001');
    expect(codigoDe('FISICO', 42)).toBe('CAF-042');
    expect(codigoDe('LOGICO', 1000)).toBe('CAL-1000');
  });

  it('transiciones válidas e inválidas', () => {
    expect(puedeTransitar('pendiente', 'ABIERTO')).toBe(true);
    expect(puedeTransitar('pendiente', 'PENDIENTE')).toBe(false);
    expect(puedeTransitar('cerrar', 'ABIERTO')).toBe(true);
    expect(puedeTransitar('cerrar', 'PENDIENTE')).toBe(true);
    expect(puedeTransitar('cerrar', 'CERRADO')).toBe(false);
    expect(puedeTransitar('reabrir', 'CERRADO')).toBe(true);
    expect(puedeTransitar('reabrir', 'ABIERTO')).toBe(false);
  });

  it('la situación se calcula por la fecha deseada sin tocar el estado', () => {
    const ahora = new Date('2026-10-20T12:00:00Z');
    expect(situacionDe('ABIERTO', new Date('2026-10-19T12:00:00Z'), ahora)).toBe('VENCIDA');
    expect(situacionDe('PENDIENTE', new Date('2026-10-21T12:00:00Z'), ahora)).toBe('PROXIMA');
    expect(situacionDe('ABIERTO', new Date('2026-10-30T12:00:00Z'), ahora)).toBe('PROGRAMADA');
    expect(situacionDe('CERRADO', new Date('2026-10-19T12:00:00Z'), ahora)).toBe('ATENDIDA');
  });

  it('audita solo lo que cambia; fechas en ISO, nulos como null', () => {
    const antes = { departamento: 'TIC', fechaAccesoDeseada: new Date('2026-10-21T13:00:00Z'), activoId: 5, recurso: null };
    const cambios = cambiosAuditables(antes, {
      departamento: 'TIC',
      fechaAccesoDeseada: new Date('2026-10-22T13:00:00Z'),
      activoId: null,
      recurso: 'Correo institucional',
    });
    expect(cambios).toEqual([
      { campo: 'activoId', valorAnterior: '5', valorNuevo: null },
      { campo: 'recurso', valorAnterior: null, valorNuevo: 'Correo institucional' },
      { campo: 'fechaAccesoDeseada', valorAnterior: '2026-10-21T13:00:00.000Z', valorNuevo: '2026-10-22T13:00:00.000Z' },
    ]);
  });
});
