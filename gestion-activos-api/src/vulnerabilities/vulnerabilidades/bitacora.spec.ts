import { describe, expect, it } from 'vitest';
import { bitacoraVulnerabilidades, pendienteEnPeriodo, remediadaEnPeriodo, type VulnerabilidadBitacora } from './bitacora.js';

const Z = 'America/Guayaquil';
const AHORA = new Date('2026-11-06T17:00:00Z');
const d = (s: string) => new Date(`${s}T12:00:00-05:00`);
const v = (fecha: string, estado = 'ABIERTO', rem: string | null = null, limite: string | null = null): VulnerabilidadBitacora => ({
  fecha: d(fecha),
  estado,
  fechaRemediacion: rem ? d(rem) : null,
  fechaLimite: limite ? d(limite) : null,
});
const T = (b: ReturnType<typeof bitacoraVulnerabilidades>, n: number) => b.periodos[n - 1];

describe('Bitácora trimestral de Vulnerabilidades (opción A: arrastre de pendientes)', () => {
  it('detectada y remediada en el mismo trimestre: identificada y remediada', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2026-02-01', 'REMEDIADO', '2026-03-01')], AHORA, Z);
    expect(T(b, 1)).toMatchObject({ numerador: 1, denominador: 1, porcentaje: 100 });
    expect(T(b, 2)).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
  });

  it('pendiente de T1 remediada en T2: cuenta en T1 (pendiente) y en T2 (remediada)', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2026-03-20', 'REMEDIADO', '2026-05-02')], AHORA, Z);
    expect(T(b, 1)).toMatchObject({ numerador: 0, denominador: 1, porcentaje: 0 });
    expect(T(b, 2)).toMatchObject({ numerador: 1, denominador: 1 });
    expect(b.informativas.find((f) => f.etiqueta === 'Detectadas en el trimestre')!.valores.slice(0, 2)).toEqual([1, 0]);
  });

  it('una pendiente se arrastra a todos los trimestres hasta hoy; los futuros no tienen cifras', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2026-01-10', 'EN_PROGRESO')], AHORA, Z);
    expect(b.periodos.map((p) => p.denominador)).toEqual([1, 1, 1, 1]);
    const b2 = bitacoraVulnerabilidades(2026, [v('2026-01-10')], new Date('2026-05-01T12:00:00Z'), Z);
    expect(b2.periodos.map((p) => p.denominador)).toEqual([1, 1, null, null]);
  });

  it('remediada en un año anterior no cuenta; detectada después del trimestre tampoco', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2025-11-01', 'REMEDIADO', '2025-12-15'), v('2026-08-01')], AHORA, Z);
    expect(T(b, 1).denominador).toBe(0);
    expect(T(b, 3).denominador).toBe(1);
  });

  it('una reabierta (sin fecha de remediación vigente) vuelve a ser pendiente', () => {
    const r = v('2026-02-01', 'EN_PROGRESO', null);
    expect(remediadaEnPeriodo(r, d('2026-01-01'), d('2026-12-31'))).toBe(false);
    expect(pendienteEnPeriodo(r, d('2026-10-01'), d('2026-12-31'))).toBe(true);
  });

  it('el estado manda: una fecha de remediación guardada sin cerrar no la cuenta como remediada', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2026-02-01', 'EN_PROGRESO', '2026-02-10')], AHORA, Z);
    expect(T(b, 1)).toMatchObject({ numerador: 0, denominador: 1 });
  });

  it('remediadas fuera de plazo (informativa)', () => {
    const b = bitacoraVulnerabilidades(2026, [v('2026-04-01', 'REMEDIADO', '2026-05-20', '2026-05-01'), v('2026-04-01', 'REMEDIADO', '2026-04-20', '2026-05-01')], AHORA, Z);
    expect(b.informativas.find((f) => f.etiqueta === 'Remediadas fuera de plazo')!.valores[1]).toBe(1);
    expect(b.informativas.find((f) => f.etiqueta === 'Pendientes al cierre')!.valores[1]).toBe(0);
  });

  it('usa el nombre, la fórmula y la frecuencia del Excel', () => {
    const b = bitacoraVulnerabilidades(2026, [], AHORA, Z);
    expect(b.indicador).toMatchObject({ frecuencia: 'TRIMESTRAL', formula: 'Vulnerabilidades remediadas / Total Identificados' });
    expect(b.periodos).toHaveLength(4);
  });
});
