import { describe, expect, it } from 'vitest';
import { bitacoraControlAcceso, enIndicadorAcceso, type SolicitudBitacora } from './bitacora.js';

const Z = 'America/Guayaquil';
const AHORA = new Date('2026-11-06T17:00:00Z');
const s = (dia: string, tipoSolicitud: string, estado: string): SolicitudBitacora => ({ fechaSolicitud: new Date(`${dia}T10:00:00-05:00`), tipoSolicitud, estado });

describe('Bitácora mensual de Control de acceso (altas: cerradas ÷ registradas)', () => {
  it('solo las altas forman la fórmula; las bajas se informan aparte', () => {
    const b = bitacoraControlAcceso(2026, [s('2026-03-02', 'ACCESO', 'CERRADO'), s('2026-03-10', 'ACCESO', 'PENDIENTE'), s('2026-03-11', 'BAJA', 'CERRADO'), s('2026-03-12', 'BAJA', 'ABIERTO')], AHORA, Z);
    expect(b.indicador).toMatchObject({ frecuencia: 'MENSUAL', formula: 'Accesos otorgados / Total solicitudes formales' });
    expect(b.periodos[2]).toMatchObject({ numerador: 1, denominador: 2, porcentaje: 50 });
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores[2];
    expect([inf('Altas pendientes de atender'), inf('Solicitudes de baja'), inf('Bajas atendidas')]).toEqual([1, 2, 1]);
  });

  it('mes sin altas: N/D; mes futuro: sin cifras', () => {
    const b = bitacoraControlAcceso(2026, [s('2026-04-01', 'BAJA', 'CERRADO')], AHORA, Z);
    expect(b.periodos[3]).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
    expect(b.periodos[11]).toMatchObject({ situacion: 'FUTURO', denominador: null });
  });

  it('la solicitud cuenta en el mes LOCAL de su fecha (23:30 del 31 de marzo = marzo)', () => {
    const b = bitacoraControlAcceso(2026, [{ fechaSolicitud: new Date('2026-04-01T04:30:00Z'), tipoSolicitud: 'ACCESO', estado: 'ABIERTO' }], AHORA, Z);
    expect([b.periodos[2].denominador, b.periodos[3].denominador]).toEqual([1, 0]);
  });

  it('marca de cada solicitud en el indicador', () => {
    expect(enIndicadorAcceso({ tipoSolicitud: 'ACCESO', estado: 'CERRADO' })).toBe('OTORGADO');
    expect(enIndicadorAcceso({ tipoSolicitud: 'ACCESO', estado: 'PENDIENTE' })).toBe('PENDIENTE');
    expect(enIndicadorAcceso({ tipoSolicitud: 'BAJA', estado: 'CERRADO' })).toBe('NO_APLICA');
  });
});
