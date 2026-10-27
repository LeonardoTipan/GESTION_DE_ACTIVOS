import {
  exigirCaducidadActual,
  exigirCierre,
  exigirCoherencia,
  faltantesCierre,
  fechaDia,
  vigencia,
  type DatosVigencia,
} from './reglas.js';

const d = fechaDia;
// 15:00 UTC = 10:00 en Guayaquil: «hoy» es el 20 de abril de 2026.
const ahora = new Date('2026-04-20T15:00:00Z');
const base: DatosVigencia = {
  estado: 'ABIERTO',
  fechaCaducidadActual: d('2026-06-30'),
  sinCaducidadActual: false,
  nuevaFechaCaducidad: null,
  nuevaSinCaducidad: false,
  sustituida: false,
};

describe('renovaciones: vigencia del elemento', () => {
  it('vigente, próxima a caducar (umbral) o caducada; el último día sigue vigente', () => {
    expect(vigencia(base, ahora, 30)).toEqual({ vigencia: 'VIGENTE', diasRestantes: 71 });
    expect(vigencia({ ...base, fechaCaducidadActual: d('2026-05-10') }, ahora, 30).vigencia).toBe('PROXIMA');
    expect(vigencia({ ...base, fechaCaducidadActual: d('2026-04-20') }, ahora, 30)).toEqual({ vigencia: 'PROXIMA', diasRestantes: 0 });
    expect(vigencia({ ...base, fechaCaducidadActual: d('2026-04-19') }, ahora, 30).vigencia).toBe('CADUCADA');
  });

  it('el proceso no cambia la vigencia: abierta con la licencia aún vigente', () => {
    expect(vigencia({ ...base, estado: 'EN_PROGRESO' }, ahora, 30).vigencia).toBe('VIGENTE');
  });

  it('cerrada: vale la nueva caducidad; sustituida por otra posterior; sin caducidad', () => {
    const cerrada = { ...base, estado: 'CERRADO' as const, fechaCaducidadActual: d('2026-04-01'), nuevaFechaCaducidad: d('2029-04-27') };
    expect(vigencia(cerrada, ahora, 30).vigencia).toBe('VIGENTE');
    expect(vigencia({ ...cerrada, sustituida: true }, ahora, 30).vigencia).toBe('SUSTITUIDA');
    expect(vigencia({ ...base, fechaCaducidadActual: null, sinCaducidadActual: true }, ahora, 30).vigencia).toBe('SIN_CADUCIDAD');
    expect(vigencia({ ...cerrada, nuevaFechaCaducidad: null, nuevaSinCaducidad: true }, ahora, 30).vigencia).toBe('SIN_CADUCIDAD');
  });
});

describe('renovaciones: fechas y cierre', () => {
  it('caducidad actual obligatoria salvo «sin caducidad» justificado', () => {
    expect(() => exigirCaducidadActual({ fechaCaducidadActual: d('2026-06-30') })).not.toThrow();
    expect(() => exigirCaducidadActual({})).toThrow(/fecha de caducidad actual/);
    expect(() => exigirCaducidadActual({ sinCaducidadActual: true })).toThrow(/Justifique/);
    expect(() => exigirCaducidadActual({ sinCaducidadActual: true, observacion: 'Licencia perpetua.' })).not.toThrow();
    expect(() => exigirCaducidadActual({ sinCaducidadActual: true, fechaCaducidadActual: d('2026-06-30'), observacion: 'x' })).toThrow(/no registre también/);
  });

  it('cierre: dice qué falta', () => {
    expect(faltantesCierre({ fechaCaducidadActual: d('2026-06-30') })).toEqual([
      'la fecha real de renovación',
      'la nueva fecha de caducidad (o marcar «sin caducidad»)',
      'el verificable',
      'el repositorio del verificable',
    ]);
    expect(() => exigirCierre({ fechaCaducidadActual: null, fechaRenovacion: d('2026-04-15') }, ahora)).toThrow(/falta la nueva fecha de caducidad/);
  });

  it('coherencia: renovación histórica válida; no futura; nueva caducidad posterior a la renovación y a la actual', () => {
    const ok = {
      fechaCaducidadActual: d('2026-04-27'),
      fechaRenovacion: d('2026-04-15'),
      nuevaFechaCaducidad: d('2029-04-27'),
      evidencia: 'Informe de Satisfacción del Contrato de Renovación',
      repositorioVerificable: 'Carpeta Compartida TICs/Interno',
    };
    expect(() => exigirCierre(ok, ahora)).not.toThrow();
    expect(() => exigirCoherencia({ ...ok, fechaRenovacion: d('2026-04-21') }, ahora)).toThrow(/futura/);
    expect(() => exigirCoherencia({ ...ok, nuevaFechaCaducidad: d('2026-04-15') }, ahora)).toThrow(/posterior a la fecha real/);
    expect(() => exigirCoherencia({ ...ok, nuevaFechaCaducidad: d('2026-04-20') }, ahora)).toThrow(/posterior a la caducidad actual/);
    expect(() => exigirCoherencia({ ...ok, repositorioVerificable: 'file:///x' }, ahora)).toThrow(/http o https/);
  });
});
