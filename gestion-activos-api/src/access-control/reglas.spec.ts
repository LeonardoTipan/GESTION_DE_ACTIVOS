import { cambiosAuditables, codigoDe, errorFechaAtendido, puedeTransitar } from './reglas.js';

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

  it('fecha atendida: histórica sí; futura, anterior a la solicitud o inválida, no', () => {
    const ahora = new Date('2026-10-21T15:00:00Z');
    const solicitud = new Date('2026-09-01T13:00:00Z');
    expect(errorFechaAtendido(new Date('2026-09-02T14:00:00Z'), solicitud, ahora)).toBeNull(); // histórica
    expect(errorFechaAtendido(new Date('2026-10-21T15:04:00Z'), solicitud, ahora)).toBeNull(); // margen del reloj
    expect(errorFechaAtendido(new Date('2026-10-22T15:00:00Z'), solicitud, ahora)).toMatch(/futura/);
    expect(errorFechaAtendido(new Date('2026-08-31T13:00:00Z'), solicitud, ahora)).toMatch(/anterior a la fecha de solicitud/);
    expect(errorFechaAtendido(new Date('no es fecha'), solicitud, ahora)).toMatch(/no es una fecha válida/);
  });

  it('audita solo lo que cambia; fechas en ISO, nulos como null', () => {
    const antes = { departamento: 'TIC', fechaAtendido: new Date('2026-10-21T13:00:00Z'), activoId: 5, recurso: null, nombreSolicitante: null };
    const cambios = cambiosAuditables(antes, {
      departamento: 'TIC',
      fechaAtendido: new Date('2026-10-20T13:00:00Z'),
      activoId: null,
      recurso: 'Correo institucional',
      nombreSolicitante: 'Ana Torres',
    });
    expect(cambios).toEqual([
      { campo: 'activoId', valorAnterior: '5', valorNuevo: null },
      { campo: 'recurso', valorAnterior: null, valorNuevo: 'Correo institucional' },
      { campo: 'nombreSolicitante', valorAnterior: null, valorNuevo: 'Ana Torres' },
      { campo: 'fechaAtendido', valorAnterior: '2026-10-21T13:00:00.000Z', valorNuevo: '2026-10-20T13:00:00.000Z' },
    ]);
  });
});
