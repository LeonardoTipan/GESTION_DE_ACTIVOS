import { BadRequestException } from '@nestjs/common';
import { cobertura, equiposSinAntivirus, exigirCierre, exigirCoherencia, inicioDelMes, type DatosRegistroPeriodo } from './reglas.js';

const OCTUBRE = { anio: 2026, mes: 10 };
const AHORA = new Date('2026-10-29T17:00:00Z');
const completo: DatosRegistroPeriodo = {
  totalActivos: 26,
  equiposConAntivirus: 25,
  fechaEjecucion: new Date('2026-10-28T15:00:00Z'),
  responsableEjecucion: 'Soporte TIC',
  evidencia: 'Inventario de equipos octubre 2026.xlsx',
  repositorioVerificable: 'Carpeta Compartida TICs/Antivirus',
};
const vacio: DatosRegistroPeriodo = { totalActivos: null, equiposConAntivirus: null, fechaEjecucion: null, responsableEjecucion: null, evidencia: null, repositorioVerificable: null };

describe('Protección de Endpoints · reglas de la fase 2', () => {
  it('cobertura con 1 decimal; sin datos o con total 0, null', () => {
    expect(cobertura(26, 25)).toBe(96.2);
    expect(cobertura(3, 3)).toBe(100);
    expect(cobertura(10, 0)).toBe(0);
    expect(cobertura(null, 5)).toBeNull();
    expect(cobertura(10, null)).toBeNull();
    expect(cobertura(0, 0)).toBeNull();
  });

  it('equipos sin antivirus = total − con antivirus', () => {
    expect(equiposSinAntivirus(26, 25)).toBe(1);
    expect(equiposSinAntivirus(null, 25)).toBeNull();
  });

  it('coherencia: total ≥ 1 y con antivirus ≤ total (también sin cerrar)', () => {
    expect(() => exigirCoherencia({ ...completo, totalActivos: 0 }, OCTUBRE, AHORA)).toThrow('al menos 1');
    expect(() => exigirCoherencia({ ...completo, equiposConAntivirus: 27 }, OCTUBRE, AHORA)).toThrow('no pueden superar el total de activos (26)');
    expect(() => exigirCoherencia({ ...completo, equiposConAntivirus: 26 }, OCTUBRE, AHORA)).not.toThrow();
    // Guardar a medias es válido: solo se compara lo que hay.
    expect(() => exigirCoherencia({ ...vacio, equiposConAntivirus: 30 }, OCTUBRE, AHORA)).not.toThrow();
  });

  it('fecha real de la medición: no futura (margen 5 min) ni anterior al mes del período (hora de Ecuador)', () => {
    expect(() => exigirCoherencia({ ...completo, fechaEjecucion: new Date('2026-10-29T17:04:00Z') }, OCTUBRE, AHORA)).not.toThrow();
    expect(() => exigirCoherencia({ ...completo, fechaEjecucion: new Date('2026-10-30T10:00:00Z') }, OCTUBRE, AHORA)).toThrow('no puede ser futura');
    // 01/10 00:00 en Quito = 01/10 05:00 UTC: un instante antes es septiembre.
    expect(inicioDelMes(OCTUBRE, 'America/Guayaquil').toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(() => exigirCoherencia({ ...completo, fechaEjecucion: new Date('2026-10-01T04:59:00Z') }, OCTUBRE, AHORA)).toThrow('anterior al mes del período');
    // Un mes ya pasado se puede medir después (carga histórica), nunca antes de que empiece.
    expect(() => exigirCoherencia({ ...completo, fechaEjecucion: new Date('2026-10-05T15:00:00Z') }, { anio: 2026, mes: 9 }, AHORA)).not.toThrow();
  });

  it('el repositorio admite carpeta o http(s), no otros esquemas', () => {
    expect(() => exigirCoherencia({ ...completo, repositorioVerificable: 'https://intranet/antivirus' }, OCTUBRE, AHORA)).not.toThrow();
    expect(() => exigirCoherencia({ ...completo, repositorioVerificable: 'javascript:alert(1)' }, OCTUBRE, AHORA)).toThrow(BadRequestException);
  });

  it('cerrar exige totales, fecha y responsable de la medición, verificable y repositorio, y dice qué falta', () => {
    expect(() => exigirCierre(completo, OCTUBRE, AHORA)).not.toThrow();
    expect(() => exigirCierre({ ...vacio, evidencia: ' ' }, OCTUBRE, AHORA)).toThrow(
      'Para cerrar el período falta: el total de activos, los equipos con antivirus activo, la fecha real de la medición, el responsable de la medición, el verificable (inventario de equipos), el repositorio del verificable.',
    );
    expect(() => exigirCierre({ ...completo, evidencia: null }, OCTUBRE, AHORA)).toThrow('falta: el verificable (inventario de equipos).');
    expect(() => exigirCierre({ ...completo, responsableEjecucion: '' }, OCTUBRE, AHORA)).toThrow('falta: el responsable de la medición.');
    expect(() => exigirCierre({ ...completo, equiposConAntivirus: 30 }, OCTUBRE, AHORA)).toThrow('no pueden superar');
  });
});
