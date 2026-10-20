import { calcularEtapa, ETAPAS_RESPALDO, WHERE_POR_ETAPA } from './etapa.js';

describe('calcularEtapa', () => {
  it.each([
    ['PENDIENTE', 'PENDIENTE', 'PENDIENTE_EJECUCION'],
    ['FALLIDA', 'PENDIENTE', 'EJECUCION_FALLIDA'],
    ['EXITOSA', 'PENDIENTE', 'PENDIENTE_PRUEBA'],
    ['EXITOSA', 'FALLIDA', 'PRUEBA_FALLIDA'],
    ['EXITOSA', 'APROBADA', 'COMPLETADO'],
  ] as const)(
    'ejecución %s + prueba %s → %s',
    (estadoEjecucion, estadoPrueba, etapa) => {
      expect(calcularEtapa({ estadoEjecucion, estadoPrueba })).toBe(etapa);
    },
  );

  it('el filtro de cada etapa es coherente con calcularEtapa', () => {
    for (const etapa of ETAPAS_RESPALDO) {
      const where = WHERE_POR_ETAPA[etapa] as {
        estadoEjecucion: 'PENDIENTE' | 'EXITOSA' | 'FALLIDA';
        estadoPrueba?: 'PENDIENTE' | 'APROBADA' | 'FALLIDA';
      };
      expect(
        calcularEtapa({
          estadoEjecucion: where.estadoEjecucion,
          estadoPrueba: where.estadoPrueba ?? 'PENDIENTE',
        }),
      ).toBe(etapa);
    }
  });
});
