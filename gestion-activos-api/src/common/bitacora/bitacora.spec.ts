import { describe, expect, it } from 'vitest';
import { construirBitacora, INDICADORES_EXCEL } from './bitacora.js';
import { periodoBitacora, periodosDelAnio, porcentajeBitacora, rangoAnio } from './periodos.js';

const Z = 'America/Guayaquil';

describe('períodos de las bitácoras', () => {
  it('mensual: 12 meses con límites en la hora de la institución', () => {
    const p = periodosDelAnio(2026, 'MENSUAL', new Date('2026-11-06T12:00:00Z'), Z);
    expect(p).toHaveLength(12);
    expect(p[0]).toMatchObject({ clave: '2026-01', etiqueta: 'Enero' });
    expect(p[0].desde.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(p[11].hasta.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(p.map((x) => x.situacion).slice(9)).toEqual(['CERRADO', 'EN_CURSO', 'FUTURO']);
  });

  it('trimestral y semestral: etiquetas y continuidad', () => {
    const t = periodosDelAnio(2026, 'TRIMESTRAL', new Date('2026-11-06T12:00:00Z'), Z);
    expect(t.map((x) => x.etiqueta)).toEqual(['T1 · ene–mar', 'T2 · abr–jun', 'T3 · jul–sep', 'T4 · oct–dic']);
    for (let i = 1; i < 4; i++) expect(t[i].desde).toEqual(t[i - 1].hasta);
    const s = periodosDelAnio(2026, 'SEMESTRAL', new Date('2026-11-06T12:00:00Z'), Z);
    expect(s.map((x) => x.clave)).toEqual(['2026-S1', '2026-S2']);
    expect(s[1].hasta).toEqual(rangoAnio(2026, Z).hasta);
  });

  it('el último instante del 31 de marzo (hora local) sigue en T1', () => {
    const t1 = periodoBitacora(2026, 'TRIMESTRAL', 1, new Date(), Z);
    expect(new Date('2026-04-01T04:59:59Z') < t1.hasta).toBe(true);
    expect(new Date('2026-04-01T05:00:00Z') < t1.hasta).toBe(false);
  });

  it('porcentaje: N/D sin denominador, nunca división por cero', () => {
    expect(porcentajeBitacora(0, 0)).toBeNull();
    expect(porcentajeBitacora(1, 3)).toBe(33.3);
    expect(porcentajeBitacora(null, 3)).toBeNull();
  });
});

describe('construirBitacora', () => {
  it('los períodos futuros quedan sin cifras (null), no en 0', () => {
    const b = construirBitacora({
      anio: 2026,
      ahora: new Date('2026-05-10T12:00:00Z'),
      zona: Z,
      indicador: { ...INDICADORES_EXCEL.evaluacion, criterio: '' },
      calcular: () => ({ numerador: 1, denominador: 4, informativas: { x: 2 } }),
      informativas: [{ etiqueta: 'x' }],
    });
    expect(b.periodos[0]).toMatchObject({ situacion: 'EN_CURSO', numerador: 1, denominador: 4, porcentaje: 25 });
    expect(b.periodos[1]).toMatchObject({ situacion: 'FUTURO', numerador: null, denominador: null, porcentaje: null });
    expect(b.informativas[0].valores).toEqual([2, null]);
  });
});
