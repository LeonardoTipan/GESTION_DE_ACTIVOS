import {
  cumplimiento,
  exigirFechasReales,
  exigirRepositorioValido,
  exigirTipoPermitido,
  rangoDe,
  semestreDe,
  tiposPermitidos,
} from './planificacion.js';

const Z = 'America/Guayaquil';
const activo = (clase: 'HARDWARE' | 'SOFTWARE' | null) => ({ codigo: 'A-1', categoria: { nombre: 'Cat', claseMantenimiento: clase } });

describe('mantenimiento: planificación', () => {
  it('tipos por clase del activo (hardware, software, sin clasificar)', () => {
    expect(tiposPermitidos('HARDWARE')).toEqual(['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO']);
    expect(tiposPermitidos('SOFTWARE')).toEqual(['PREVENTIVO', 'CORRECTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO']);
    expect(tiposPermitidos(null)).toEqual(['PREVENTIVO', 'CORRECTIVO']);
    expect(() => exigirTipoPermitido('PREDICTIVO', activo('HARDWARE'))).not.toThrow();
    expect(() => exigirTipoPermitido('EVOLUTIVO', activo('HARDWARE'))).toThrow(/no corresponde a hardware/);
    expect(() => exigirTipoPermitido('PREDICTIVO', activo('SOFTWARE'))).toThrow(/no corresponde a software/);
    expect(() => exigirTipoPermitido('PERFECTIVO', activo(null))).toThrow(/no está clasificada/);
  });

  it('semestre y año de la fecha de inicio planificada, en hora de Guayaquil', () => {
    expect(semestreDe(new Date('2026-01-20T15:00:00Z'), Z)).toEqual({ anio: 2026, semestre: 1, etiqueta: 'S1-2026' });
    expect(semestreDe(new Date('2026-08-15T15:00:00Z'), Z)).toEqual({ anio: 2026, semestre: 2, etiqueta: 'S2-2026' });
    // 30 de junio 22:00 en Guayaquil = 1 de julio 03:00 UTC: sigue siendo S1.
    expect(semestreDe(new Date('2026-07-01T03:00:00Z'), Z).etiqueta).toBe('S1-2026');
    // 31 de diciembre 23:30 en Guayaquil: S2 de ese año.
    expect(semestreDe(new Date('2027-01-01T04:30:00Z'), Z).etiqueta).toBe('S2-2026');
  });

  it('rango de un semestre y de un año (medianoche de Guayaquil)', () => {
    expect(rangoDe(2026, 1, Z)).toEqual({ desde: new Date('2026-01-01T05:00:00Z'), hasta: new Date('2026-07-01T05:00:00Z') });
    expect(rangoDe(2026, 2, Z)).toEqual({ desde: new Date('2026-07-01T05:00:00Z'), hasta: new Date('2027-01-01T05:00:00Z') });
    expect(rangoDe(2026, undefined, Z)).toEqual({ desde: new Date('2026-01-01T05:00:00Z'), hasta: new Date('2027-01-01T05:00:00Z') });
  });

  it('cumplimiento sin dividir por cero', () => {
    expect(cumplimiento(3, 4)).toBe(75);
    expect(cumplimiento(1, 3)).toBe(33.3);
    expect(cumplimiento(0, 0)).toBeNull();
  });

  it('repositorio: carpeta o URL http(s)', () => {
    expect(() => exigirRepositorioValido('Carpeta Compartida TICs/Interno')).not.toThrow();
    expect(() => exigirRepositorioValido('\\\\servidor\\tics\\informes')).not.toThrow();
    expect(() => exigirRepositorioValido('C:\\Informes\\2026')).not.toThrow();
    expect(() => exigirRepositorioValido('file:///C:/Informes')).toThrow(/http o https/);
    expect(() => exigirRepositorioValido('https://intranet.example/informe.pdf')).not.toThrow();
    expect(() => exigirRepositorioValido('javascript:alert(1)')).toThrow(/http o https/);
    expect(() => exigirRepositorioValido('http://')).toThrow(/no es una URL válida/);
  });

  it('fechas reales: no futuras y fin no anterior al inicio', () => {
    const ahora = new Date('2026-10-22T15:00:00Z');
    expect(() => exigirFechasReales(new Date('2026-10-01T10:00:00Z'), new Date('2026-10-02T10:00:00Z'), ahora)).not.toThrow();
    expect(() => exigirFechasReales(new Date('2026-10-23T10:00:00Z'), null, ahora)).toThrow(/futura/);
    expect(() => exigirFechasReales(new Date('2026-10-02T10:00:00Z'), new Date('2026-10-01T10:00:00Z'), ahora)).toThrow(/anterior/);
  });
});
