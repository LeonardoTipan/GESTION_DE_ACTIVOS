import { describe, expect, it } from 'vitest';
import { RESPONSABLE_GLPI } from '../../glpi-sync/plan.js';
import { RESPONSABLE_SINCRONIZACION } from './bitacora.service.js';

describe('origen de los movimientos del inventario', () => {
  it('la bitácora reconoce la firma con la que la sincronización registra sus cambios', () => {
    expect(RESPONSABLE_SINCRONIZACION).toBe(RESPONSABLE_GLPI);
  });
});
