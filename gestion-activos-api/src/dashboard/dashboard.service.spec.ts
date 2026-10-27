import { vi } from 'vitest';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ControlAccesoService } from '../access-control/control-acceso.service.js';
import { MantenimientosService } from '../maintenance/mantenimientos/mantenimientos.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RenovacionesService } from '../renewals/renovaciones.service.js';
import { VulnerabilidadesService } from '../vulnerabilities/vulnerabilidades/vulnerabilidades.service.js';
import { DashboardService } from './dashboard.service.js';

const servicio = (n: number | Error) => ({
  contarPendientes: vi.fn(() => (n instanceof Error ? Promise.reject(n) : Promise.resolve(n))),
});

const tablero = (a: number | Error, m: number | Error, v: number | Error, r: number | Error) =>
  new DashboardService(
    servicio(a) as unknown as ControlAccesoService,
    servicio(m) as unknown as MantenimientosService,
    servicio(v) as unknown as VulnerabilidadesService,
    servicio(r) as unknown as RenovacionesService,
  );

describe('DashboardService.pendientes', () => {
  it('consolida los cuatro conteos y el total es su suma', async () => {
    await expect(tablero(3, 1, 0, 2).pendientes()).resolves.toEqual({
      accesos: 3,
      mantenimientos: 1,
      vulnerabilidades: 0,
      renovaciones: 2,
      total: 6,
    });
  });

  it('si un conteo falla, lanza 500 (no devuelve 0) y lo registra con el módulo', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const promesa = tablero(3, new Error('timeout'), 0, 2).pendientes();
    await expect(promesa).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('mantenimientos: timeout'), expect.anything());
    log.mockRestore();
  });
});

/**
 * Cada módulo cuenta en la base (COUNT) con su propia definición de pendiente;
 * no carga filas. Se comprueba la consulta que llega a Prisma.
 */
describe('contarPendientes de cada módulo', () => {
  const prisma = () => {
    const modelo = () => ({ count: vi.fn().mockResolvedValue(7), findMany: vi.fn() });
    return { controlAcceso: modelo(), mantenimiento: modelo(), vulnerabilidad: modelo(), renovacion: modelo() };
  };
  const nada = {} as never;

  it('Control de acceso: ABIERTO y PENDIENTE', async () => {
    const p = prisma();
    await expect(new ControlAccesoService(p as unknown as PrismaService, nada).contarPendientes()).resolves.toBe(7);
    expect(p.controlAcceso.count).toHaveBeenCalledWith({ where: { estado: { in: ['ABIERTO', 'PENDIENTE'] } } });
    expect(p.controlAcceso.findMany).not.toHaveBeenCalled();
  });

  it('Mantenimientos: PROGRAMADO y EN_EJECUCION, no anulados, con activo', async () => {
    const p = prisma();
    await new MantenimientosService(p as unknown as PrismaService, nada, nada, nada).contarPendientes();
    expect(p.mantenimiento.count).toHaveBeenCalledWith({
      where: { fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] }, anuladoEn: null, activo: { id: { gt: 0 } } },
    });
    expect(p.mantenimiento.findMany).not.toHaveBeenCalled();
  });

  it('Vulnerabilidades: ABIERTO y EN_PROGRESO, no anuladas, con activo', async () => {
    const p = prisma();
    await new VulnerabilidadesService(p as unknown as PrismaService, nada, nada, nada).contarPendientes();
    expect(p.vulnerabilidad.count).toHaveBeenCalledWith({
      where: { estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, anuladoEn: null, activo: { id: { gt: 0 } } },
    });
    expect(p.vulnerabilidad.findMany).not.toHaveBeenCalled();
  });

  it('Renovaciones: ABIERTO y EN_PROGRESO, no anuladas', async () => {
    const p = prisma();
    await new RenovacionesService(p as unknown as PrismaService, nada, nada).contarPendientes();
    expect(p.renovacion.count).toHaveBeenCalledWith({ where: { estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, anuladoEn: null } });
    expect(p.renovacion.findMany).not.toHaveBeenCalled();
  });
});
