import { diferencias } from '../../audit/trazas.service.js';
import { indicadoresMantenimiento } from '../../maintenance/mantenimientos/indicadores.js';
import { indicadoresVulnerabilidad } from '../../vulnerabilities/vulnerabilidades/indicadores.js';
import { indicador, periodoOTrimestre, porcentaje } from './indicador.js';

describe('indicador · estado frente a la meta', () => {
  const ind = (valor: number | null, meta = 100, direccion?: 'subir' | 'bajar') =>
    indicador({ id: 'X', nombre: 'x', control: 'A.0', unidad: '%', valor, meta, direccion, formula: 'f', hallazgo: 'h' });

  it('subir: en meta, en observación (a menos del 10 %) o fuera de meta', () => {
    expect(ind(100).estado).toBe('EN_META');
    expect(ind(92).estado).toBe('EN_OBSERVACION');
    expect(ind(50)).toMatchObject({ estado: 'FUERA_DE_META', hallazgo: 'h', progreso: 50 });
  });

  it('bajar: cuanto menor, mejor', () => {
    expect(ind(0, 0, 'bajar').estado).toBe('EN_META');
    expect(ind(1, 0, 'bajar').estado).toBe('EN_OBSERVACION');
    expect(ind(5, 0, 'bajar').estado).toBe('FUERA_DE_META');
  });

  it('sin datos no es un fallo ni un cero', () => {
    expect(ind(null)).toMatchObject({ estado: 'SIN_DATOS', hallazgo: null, progreso: 0 });
    expect(porcentaje(1, 0)).toBeNull();
    expect(porcentaje(2, 3)).toBe(66.7);
  });

  it('el período por defecto es el trimestre actual; "hasta" incluye todo el día', () => {
    const { desde, hasta } = periodoOTrimestre(new Date('2026-07-01'), new Date('2026-09-30'));
    expect(desde.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });
});

describe('diferencias · lo que guarda la traza de una modificación', () => {
  it('solo los campos enviados que cambian, con fechas legibles', () => {
    expect(
      diferencias(
        { medio: 'CINTA_LTO8', rpoHoras: 24, fecha: new Date('2026-07-05T00:00:00Z'), nota: null },
        { medio: 'NUBE_INMUTABLE', rpoHoras: 24, fecha: new Date('2026-07-06T00:00:00Z'), nota: undefined },
      ),
    ).toEqual([
      { campo: 'medio', antes: 'CINTA_LTO8', despues: 'NUBE_INMUTABLE' },
      { campo: 'fecha', antes: '2026-07-05T00:00:00.000Z', despues: '2026-07-06T00:00:00.000Z' },
    ]);
  });
});

describe('indicadores de mantenimiento (A.7.13)', () => {
  const ahora = new Date('2026-10-14T12:00:00Z');
  const m = (id: number, extra: object) => ({
    id,
    tipo: 'PREVENTIVO',
    fase: 'FINALIZADO',
    estadoEquipo: 'OPERATIVO',
    fecha: new Date('2026-09-01T10:00:00Z'),
    fechaInicio: new Date('2026-09-01T10:00:00Z'),
    fechaFin: new Date('2026-09-01T12:00:00Z'),
    ...extra,
  });

  it('cumplimiento, vencidos, equipos operativos, preventivos y duración media', () => {
    const ind = indicadoresMantenimiento(
      [
        m(1, {}),
        m(2, { fase: 'PROGRAMADO', fechaInicio: null, fechaFin: null, estadoEquipo: null }),
        m(3, { tipo: 'CORRECTIVO', estadoEquipo: 'DEGRADADO' }),
        m(4, { fase: 'CANCELADO' }),
        m(5, { fase: 'PROGRAMADO', fecha: new Date('2026-11-01T10:00:00Z'), fechaInicio: null, fechaFin: null }),
      ],
      ahora,
    );
    const v = Object.fromEntries(ind.map((i) => [i.id, i.valor]));
    expect(v).toEqual({ 'MAN-01': 66.7, 'MAN-02': 1, 'MAN-03': 50, 'MAN-04': 75, 'MAN-05': 120 });
  });
});

describe('indicadores de vulnerabilidades (A.8.8)', () => {
  const ahora = new Date('2026-10-14T12:00:00Z');
  const v = (id: number, extra: object) => ({
    id,
    cve: `CVE-${id}`,
    nivelRiesgo: 'ALTO',
    estado: 'ABIERTO',
    fecha: new Date('2026-09-01T00:00:00Z'),
    fechaLimite: new Date('2026-10-01T00:00:00Z'),
    fechaRemediacion: null,
    ...extra,
  });

  it('abiertas graves, fuera de plazo, remediadas a tiempo y tiempo medio', () => {
    const todas = [
      v(1, {}),
      v(2, { nivelRiesgo: 'BAJO', fechaLimite: null }),
      v(3, { estado: 'REMEDIADO', fechaRemediacion: new Date('2026-09-11T00:00:00Z') }),
      v(4, { estado: 'REMEDIADO', fechaRemediacion: new Date('2026-10-11T00:00:00Z') }),
    ];
    const ind = indicadoresVulnerabilidad(todas, todas, ahora);
    const valores = Object.fromEntries(ind.map((i) => [i.id, i.valor]));
    expect(valores).toEqual({ 'VUL-01': 1, 'VUL-02': 1, 'VUL-03': 50, 'VUL-04': 25 });
    expect(ind[0].hallazgo).toContain('CVE-1');
  });
});
