import { describe, expect, it } from 'vitest';
import { bitacoraRespaldos, ventanasDelAnio, vigencias, type EjecucionBitacoraRespaldo, type PlanBitacoraRespaldo, type RestauracionBitacoraRespaldo } from './calculo.js';

const Z = 'America/Guayaquil';
const HOY = '2026-11-06';
const AHORA = new Date('2026-11-06T17:00:00Z');
const plan = (extra: Partial<PlanBitacoraRespaldo> = {}): PlanBitacoraRespaldo => ({
  id: 1,
  activo: { id: 9, codigo: 'SRV-1', nombre: 'Servidor' },
  responsable: 'INFRA',
  frecuencia: 'MENSUAL',
  vigenteDesde: '2026-01-01',
  vigencias: [{ desde: '2026-01-01', hasta: null }],
  bajaActivo: null,
  ...extra,
});
const ej = (id: number, fecha: string, resultado = 'EXITOSO', planId = 1): EjecucionBitacoraRespaldo => ({ id, planId, fecha, resultado, responsable: 'OPERADOR', evidencia: `job-${id}` });
const rest = (id: number, ejecucionId: number, fecha: string, resultado = 'EXITOSO', motivo = 'PRUEBA_PROGRAMADA'): RestauracionBitacoraRespaldo => ({ id, ejecucionId, fecha, resultado, motivo, evidencia: `Acta ${id}`, responsable: 'INFRA' });
const calcular = (planes: PlanBitacoraRespaldo[], e: EjecucionBitacoraRespaldo[], r: RestauracionBitacoraRespaldo[] = []) =>
  bitacoraRespaldos(2026, ventanasDelAnio(2026, planes, e, r, HOY), e, r, AHORA, Z);

describe('Bitácora mensual de Respaldos (opción A: ventanas cubiertas por una ejecución EXITOSA)', () => {
  it('mensual: cada mes cerrado es una ventana programada; solo la EXITOSA la valida', () => {
    const b = calcular([plan()], [ej(1, '2026-01-10'), ej(2, '2026-02-10', 'FALLIDO'), ej(3, '2026-03-05', 'PARCIAL'), ej(4, '2026-03-20')]);
    expect(b.periodos.slice(0, 4).map((p) => [p.numerador, p.denominador])).toEqual([[1, 1], [0, 1], [1, 1], [0, 1]]);
    expect(b.periodos[10]).toMatchObject({ situacion: 'EN_CURSO', numerador: 0, denominador: 0, porcentaje: null });
    expect(b.periodos[11]).toMatchObject({ situacion: 'FUTURO', numerador: null });
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores;
    expect(inf('Ejecuciones fallidas o parciales').slice(0, 3)).toEqual([0, 1, 1]);
    expect(inf('Ventanas aún en curso')[10]).toBe(1);
  });

  it('semanal: cada semana cuenta en el mes en que termina (sin doble conteo)', () => {
    const v = ventanasDelAnio(2026, [plan({ frecuencia: 'SEMANAL' })], [], [], HOY);
    // 2026-01-26 (lun) a 2026-02-01 (dom): cuenta en febrero.
    const cruce = v.find((w) => w.ini === '2026-01-26')!;
    expect(cruce.mes).toBe(2);
    expect(v.filter((w) => w.ini === '2026-01-26')).toHaveLength(1);
  });

  it('un plan suspendido después sigue contando en los meses en que estuvo vigente', () => {
    const p = plan({ vigencias: [{ desde: '2026-01-01', hasta: '2026-04-15' }] });
    const b = calcular([p], [ej(1, '2026-01-10')]);
    expect(b.periodos.slice(0, 6).map((x) => x.denominador)).toEqual([1, 1, 1, 1, 0, 0]);
  });

  it('activo dado de baja: no exige ventanas desde la baja', () => {
    const b = calcular([plan({ bajaActivo: '2026-03-01' })], []);
    expect(b.periodos.slice(0, 4).map((x) => x.denominador)).toEqual([1, 1, 0, 0]);
  });

  it('la específica distingue la copia de la prueba de restauración', () => {
    const v = ventanasDelAnio(2026, [plan()], [ej(1, '2026-01-10'), ej(2, '2026-01-05', 'FALLIDO')], [rest(7, 1, '2026-01-20')], HOY);
    expect(v[0]).toMatchObject({ situacion: 'CUMPLIDA', ejecucion: { id: 1, resultado: 'EXITOSO' }, noValidas: 1, restauracion: { id: 7, evidencia: 'Acta 7' } });
    const b = calcular([plan()], [ej(1, '2026-01-10')], [rest(7, 1, '2026-01-20'), rest(8, 1, '2026-01-21', 'FALLIDO')]);
    expect(b.informativas.find((f) => f.etiqueta === 'Pruebas de restauración exitosas')!.valores[0]).toBe(1);
  });

  it('vigencias: alta, suspensión y reactivación desde la auditoría', () => {
    expect(vigencias('2026-01-01', 'VIGENTE', [])).toEqual([{ desde: '2026-01-01', hasta: null }]);
    expect(
      vigencias('2026-01-01', 'VIGENTE', [
        { dia: '2026-03-10', antes: 'VIGENTE', despues: 'SUSPENDIDO' },
        { dia: '2026-05-02', antes: 'SUSPENDIDO', despues: 'VIGENTE' },
      ]),
    ).toEqual([{ desde: '2026-01-01', hasta: '2026-03-10' }, { desde: '2026-05-02', hasta: null }]);
    expect(vigencias('2026-01-01', 'SUSPENDIDO', [])).toEqual([]);
  });
});
