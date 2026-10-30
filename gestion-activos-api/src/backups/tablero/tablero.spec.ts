import { calcularTablero, type DatosTablero } from './tablero.js';
import { estadoVentana, ventanasDe } from './ventanas.js';

const TRIMESTRE = { ini: '2026-07-01', fin: '2026-09-30' };

describe('ventanasDe · ventanas programadas según la frecuencia', () => {
  it('mensual: una por mes del período, desde que rige el plan', () => {
    expect(ventanasDe('MENSUAL', '2026-08-10', TRIMESTRE, '2026-10-14')).toEqual([
      { ini: '2026-08-10', fin: '2026-08-31', corto: 'ago 2026', etiqueta: 'agosto de 2026' },
      { ini: '2026-09-01', fin: '2026-09-30', corto: 'sep 2026', etiqueta: 'septiembre de 2026' },
    ]);
  });

  it('trimestral, semestral y anual se recortan al período', () => {
    expect(ventanasDe('TRIMESTRAL', '2026-01-01', TRIMESTRE, '2026-10-14').map((w) => w.corto)).toEqual(['T3 2026']);
    expect(ventanasDe('SEMESTRAL', '2026-01-01', TRIMESTRE, '2026-10-14')).toEqual([
      { ini: '2026-07-01', fin: '2026-09-30', corto: 'S2 2026', etiqueta: 'segundo semestre de 2026' },
    ]);
    expect(ventanasDe('ANUAL', '2025-03-01', TRIMESTRE, '2026-10-14').map((w) => [w.ini, w.fin])).toEqual([
      ['2026-07-01', '2026-09-30'],
    ]);
  });

  it('quincenal: dos por mes; semanal: de lunes a domingo', () => {
    const quincenas = ventanasDe('QUINCENAL', '2026-09-01', { ini: '2026-09-01', fin: '2026-09-30' }, '2026-10-14');
    expect(quincenas.map((w) => w.corto)).toEqual(['1–15 sep', '16–30 sep']);
    const semanas = ventanasDe('SEMANAL', '2026-09-01', { ini: '2026-09-01', fin: '2026-09-13' }, '2026-10-14');
    // 1 de septiembre de 2026 es martes: la primera semana empieza ese día (recortada).
    expect(semanas.map((w) => [w.ini, w.fin])).toEqual([
      ['2026-09-01', '2026-09-06'],
      ['2026-09-07', '2026-09-13'],
    ]);
  });

  it('diaria sobre un período enorme no desborda (tope de ventanas)', () => {
    const v = ventanasDe('DIARIO', '2000-01-01', { ini: '2000-01-01', fin: '2099-12-31' }, '2026-10-14');
    expect(v.length).toBeLessThanOrEqual(400);
  });

  it('un plan que empieza después del período no tiene ventanas', () => {
    expect(ventanasDe('MENSUAL', '2026-12-01', TRIMESTRE, '2026-10-14')).toEqual([]);
  });
});

describe('estadoVentana', () => {
  const w = { ini: '2026-09-01', fin: '2026-09-30', corto: 'sep', etiqueta: 'sep' };
  it('cumplida si hay un registro dentro; si no, según hoy', () => {
    expect(estadoVentana(w, ['2026-09-15'], '2026-10-14')).toBe('CUMPLIDA');
    expect(estadoVentana(w, ['2026-10-01'], '2026-10-14')).toBe('VENCIDA');
    expect(estadoVentana(w, [], '2026-09-20')).toBe('EN_CURSO');
    expect(estadoVentana(w, [], '2026-08-20')).toBe('PROGRAMADA');
  });
});

describe('calcularTablero · indicadores RES-00…RES-07', () => {
  const activo = (id: number) => ({ id, codigo: `A-${id}`, nombre: `Activo ${id}` });
  const base = (): DatosTablero => ({
    hoy: '2026-10-14',
    periodo: TRIMESTRE,
    criticos: [activo(1), activo(2)],
    planes: [
      { id: 10, activo: activo(1), frecuencia: 'MENSUAL', frecuenciaPrueba: 'TRIMESTRAL', vigenteDesde: '2026-07-01' },
    ],
    ejecuciones: [
      { id: 1, activoId: 1, fecha: '2026-07-05', resultado: 'EXITOSO', cifrado: true, fueraSitio: true, inmutable: true, integridad: true },
      { id: 2, activoId: 1, fecha: '2026-08-12', resultado: 'FALLIDO', cifrado: false, fueraSitio: false, inmutable: false, integridad: false },
    ],
    restauraciones: [
      { id: 5, activoId: 1, fecha: '2026-07-24', motivo: 'PRUEBA_PROGRAMADA', resultado: 'EXITOSO', tiempoRealMin: 96, rtoMinutos: 240 },
      { id: 6, activoId: 1, fecha: '2026-08-28', motivo: 'INCIDENTE_DISPONIBILIDAD', resultado: 'EXITOSO', tiempoRealMin: 300, rtoMinutos: 240 },
    ],
  });

  it('calcula cada indicador con su fórmula y estado', () => {
    const { indicadores, calendario, pendientes } = calcularTablero(base());
    const ind = Object.fromEntries(indicadores.map((i) => [i.id, i]));
    expect(ind['RES-00']).toMatchObject({ valor: 50, estado: 'FUERA_DE_META', formula: expect.stringContaining('1/2') });
    expect(ind['RES-00'].hallazgo).toContain('Activo 2');
    // Ventanas de jul, ago y sep: solo jul cumplida (EXITOSO); ago tiene una ejecución FALLIDA, que no cumple; sep vencida.
    expect(ind['RES-01b']).toMatchObject({ valor: 33.3 }); // 1 de 3 ventanas: la fallida ya no cuenta como cumplida
    expect(ind['RES-01']).toMatchObject({ valor: 50 });
    expect(ind['RES-02']).toMatchObject({ valor: 50 });
    expect(ind['RES-03']).toMatchObject({ valor: 50 }); // solo el activo 1 tiene copia fuera de sitio e inmutable
    expect(ind['RES-04']).toMatchObject({ valor: 100 }); // T3 cubierto por la prueba programada
    expect(ind['RES-05']).toMatchObject({ valor: 50 });
    expect(ind['RES-06']).toMatchObject({ valor: 198, estado: 'EN_OBSERVACION', direccion: 'bajar' });
    expect(ind['RES-07']).toMatchObject({ valor: 50 });
    expect(calendario[0].ejecucion.map((w) => [w.corto, w.estado, w.registros])).toEqual([
      ['jul 2026', 'CUMPLIDA', [1]],
      ['ago 2026', 'VENCIDA', [2]], // la fallida sigue listada en su ventana, pero no la cumple
      ['sep 2026', 'VENCIDA', []],
    ]);
    expect(pendientes).toEqual({ ejecucion: 2, prueba: 0 }); // ago (solo fallida) y sep siguen sin una copia válida
  });

  it('sin datos en el período: indicadores "sin datos", no ceros engañosos', () => {
    const { indicadores } = calcularTablero({ ...base(), criticos: [], planes: [], ejecuciones: [], restauraciones: [] });
    expect(indicadores.every((i) => i.valor === null && i.estado === 'SIN_DATOS')).toBe(true);
  });
});
