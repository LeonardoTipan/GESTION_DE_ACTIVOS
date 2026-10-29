import { BadRequestException } from '@nestjs/common';
import { cobertura, equiposSinAntivirus, exigirCierre, exigirCoherencia, type DatosRegistroPeriodo } from './reglas.js';

const completo: DatosRegistroPeriodo = {
  totalActivos: 26,
  equiposConAntivirus: 25,
  evidencia: 'Inventario de equipos octubre 2026.xlsx',
  repositorioVerificable: 'Carpeta Compartida TICs/Antivirus',
};

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
    expect(() => exigirCoherencia({ ...completo, totalActivos: 0 })).toThrow('al menos 1');
    expect(() => exigirCoherencia({ ...completo, equiposConAntivirus: 27 })).toThrow('no pueden superar el total de activos (26)');
    expect(() => exigirCoherencia({ ...completo, equiposConAntivirus: 26 })).not.toThrow();
    // Guardar a medias es válido: solo se compara lo que hay.
    expect(() => exigirCoherencia({ totalActivos: null, equiposConAntivirus: 30, evidencia: null, repositorioVerificable: null })).not.toThrow();
  });

  it('el repositorio admite carpeta o http(s), no otros esquemas', () => {
    expect(() => exigirCoherencia({ ...completo, repositorioVerificable: 'https://intranet/antivirus' })).not.toThrow();
    expect(() => exigirCoherencia({ ...completo, repositorioVerificable: 'javascript:alert(1)' })).toThrow(BadRequestException);
  });

  it('cerrar exige los dos totales, el verificable y el repositorio, y dice qué falta', () => {
    expect(() => exigirCierre(completo)).not.toThrow();
    expect(() => exigirCierre({ totalActivos: null, equiposConAntivirus: null, evidencia: ' ', repositorioVerificable: null })).toThrow(
      'Para cerrar el período falta: el total de activos, los equipos con antivirus activo, el verificable (inventario de equipos), el repositorio del verificable.',
    );
    expect(() => exigirCierre({ ...completo, evidencia: null })).toThrow('falta: el verificable (inventario de equipos).');
    expect(() => exigirCierre({ ...completo, equiposConAntivirus: 30 })).toThrow('no pueden superar');
  });
});
