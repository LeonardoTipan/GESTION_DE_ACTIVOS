import { estaVencido, puedeTransicionar } from './transiciones.js';

describe('máquina de estados del mantenimiento', () => {
  it.each([
    ['PROGRAMADO', 'iniciar', true],
    ['PROGRAMADO', 'finalizar', false],
    ['PROGRAMADO', 'cancelar', true],
    ['EN_EJECUCION', 'iniciar', false],
    ['EN_EJECUCION', 'finalizar', true],
    ['EN_EJECUCION', 'cancelar', true],
    ['FINALIZADO', 'iniciar', false],
    ['FINALIZADO', 'finalizar', false],
    ['FINALIZADO', 'cancelar', false],
    ['CANCELADO', 'iniciar', false],
    ['CANCELADO', 'finalizar', false],
    ['CANCELADO', 'cancelar', false],
  ] as const)('%s + %s → %s', (fase, accion, permitido) => {
    expect(puedeTransicionar(fase, accion)).toBe(permitido);
  });
});

describe('estaVencido', () => {
  const ahora = new Date('2026-10-01T12:00:00.000Z');
  const ayer = new Date('2026-09-30T12:00:00.000Z');
  const manana = new Date('2026-10-02T12:00:00.000Z');

  it('programado con fecha pasada → vencido', () => {
    expect(estaVencido({ fase: 'PROGRAMADO', fecha: ayer }, ahora)).toBe(true);
  });

  it('programado con fecha futura → no vencido', () => {
    expect(estaVencido({ fase: 'PROGRAMADO', fecha: manana }, ahora)).toBe(
      false,
    );
  });

  it('en ejecución o cerrado nunca está vencido', () => {
    for (const fase of ['EN_EJECUCION', 'FINALIZADO', 'CANCELADO'] as const) {
      expect(estaVencido({ fase, fecha: ayer }, ahora)).toBe(false);
    }
  });
});
