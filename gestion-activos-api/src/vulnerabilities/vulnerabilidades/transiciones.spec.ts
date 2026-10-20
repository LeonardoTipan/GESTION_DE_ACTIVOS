import { estaVencida, puedeTransicionar } from './transiciones.js';

describe('ciclo de vida de la vulnerabilidad', () => {
  it.each([
    ['ABIERTA', 'iniciar-mitigacion', true],
    ['ABIERTA', 'mitigar', false],
    ['ABIERTA', 'aceptar-riesgo', true],
    ['EN_MITIGACION', 'iniciar-mitigacion', false],
    ['EN_MITIGACION', 'mitigar', true],
    ['EN_MITIGACION', 'aceptar-riesgo', true],
    ['MITIGADA', 'iniciar-mitigacion', false],
    ['MITIGADA', 'mitigar', false],
    ['MITIGADA', 'aceptar-riesgo', false],
    ['ACEPTADA', 'iniciar-mitigacion', false],
    ['ACEPTADA', 'mitigar', false],
    ['ACEPTADA', 'aceptar-riesgo', false],
  ] as const)('%s + %s → %s', (estado, accion, permitido) => {
    expect(puedeTransicionar(estado, accion)).toBe(permitido);
  });
});

describe('estaVencida', () => {
  const ahora = new Date('2026-10-01T12:00:00.000Z');
  const ayer = new Date('2026-09-30T12:00:00.000Z');
  const manana = new Date('2026-10-02T12:00:00.000Z');

  it('abierta o en mitigación con plazo vencido → vencida', () => {
    expect(estaVencida({ estado: 'ABIERTA', fechaLimite: ayer }, ahora)).toBe(
      true,
    );
    expect(
      estaVencida({ estado: 'EN_MITIGACION', fechaLimite: ayer }, ahora),
    ).toBe(true);
  });

  it('con plazo futuro o sin plazo → no vencida', () => {
    expect(estaVencida({ estado: 'ABIERTA', fechaLimite: manana }, ahora)).toBe(
      false,
    );
    expect(estaVencida({ estado: 'ABIERTA', fechaLimite: null }, ahora)).toBe(
      false,
    );
  });

  it('una vulnerabilidad cerrada nunca está vencida', () => {
    for (const estado of ['MITIGADA', 'ACEPTADA'] as const) {
      expect(estaVencida({ estado, fechaLimite: ayer }, ahora)).toBe(false);
    }
  });
});
