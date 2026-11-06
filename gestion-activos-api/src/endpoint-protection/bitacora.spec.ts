import { describe, expect, it } from 'vitest';
import { bitacoraEndpoints, type PeriodoEndpointBitacora } from './bitacora.js';

const Z = 'America/Guayaquil';
const AHORA = new Date('2026-11-06T17:00:00Z');
const lineas = (con: number, sin: number, pendientes = 0) => [
  ...Array.from({ length: con }, () => ({ conAntivirus: true })),
  ...Array.from({ length: sin }, () => ({ conAntivirus: false })),
  ...Array.from({ length: pendientes }, () => ({ conAntivirus: null })),
];
const p = (mes: number, estado: string, extra: Partial<PeriodoEndpointBitacora> = {}): PeriodoEndpointBitacora => ({ mes, estado, totalActivos: null, equiposConAntivirus: null, lineas: [], ...extra });

describe('Bitácora mensual de Protección de Endpoints', () => {
  it('período cerrado con detalle: totales del detalle por equipo', () => {
    const b = bitacoraEndpoints(2026, [p(2, 'CERRADO', { lineas: lineas(25, 1), totalActivos: 99, equiposConAntivirus: 99 })], AHORA, Z);
    expect(b.indicador).toMatchObject({ frecuencia: 'MENSUAL', formula: 'Equipos con antivirus activo / Total activos' });
    expect(b.periodos[1]).toMatchObject({ numerador: 25, denominador: 26, porcentaje: 96.2 });
    expect(b.informativas[0].valores[1]).toBe(1);
  });

  it('período anterior sin detalle: los totales registrados', () => {
    const b = bitacoraEndpoints(2026, [p(1, 'CERRADO', { totalActivos: 40, equiposConAntivirus: 38 })], AHORA, Z);
    expect(b.periodos[0]).toMatchObject({ numerador: 38, denominador: 40, porcentaje: 95 });
  });

  it('período sin cerrar: el mes queda N/D y se informan los equipos por registrar', () => {
    const b = bitacoraEndpoints(2026, [p(10, 'EN_PROGRESO', { lineas: lineas(3, 0, 2) })], AHORA, Z);
    expect(b.periodos[9]).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
    expect(b.informativas[1].valores[9]).toBe(2);
  });

  it('mes sin período: N/D; mes futuro: sin cifras', () => {
    const b = bitacoraEndpoints(2026, [], AHORA, Z);
    expect(b.periodos[4]).toMatchObject({ denominador: 0, porcentaje: null });
    expect(b.periodos[11]).toMatchObject({ situacion: 'FUTURO', denominador: null });
  });
});
