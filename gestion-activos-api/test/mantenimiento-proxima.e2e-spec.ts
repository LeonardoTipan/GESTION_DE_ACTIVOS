/**
 * Mantenimientos: la PRÓXIMA intervención de un plan sale del FIN REAL de la última ejecución
 * finalizada + período (no de la fecha prevista ni del momento de programar). Contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 30_000;
/** Instante a partir de la hora LOCAL de Ecuador (UTC−5). */
const ec = (diaHora: string) => new Date(`${diaHora}-05:00`).toISOString();
const MOTIVO = 'Corrección documentada con el acta firmada del técnico.';

describe('Mantenimientos · próxima intervención desde el fin real (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let n = 0;

  const api = (token: string) => {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string, body: object = {}) => request(server).post(url).set('Authorization', `Bearer ${token}`).send(body),
      patch: (url: string, body: object = {}) => request(server).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    };
  };
  const plan = async (frecuencia: string, fechaInicio: string) => {
    const tipos = ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'];
    const tipo = tipos[n++ % tipos.length];
    if (n > tipos.length) {
      // Un activo tiene un solo plan vigente de cada tipo: otro activo para los siguientes.
      const otro = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
      activoId = (await prisma.activo.create({ data: { ...otro, id: undefined, codigo: `PC-PROX-${n}`, createdAt: undefined, updatedAt: undefined } })).id;
    }
    return (
      await api(tokens.analista)
        .post('/api/mantenimientos/planes', { tipo, frecuencia, fechaInicio, responsable: 'Soporte TIC', actividades: 'Limpieza y revisión general del equipo.', activoIds: [activoId] })
        .expect(201)
    ).body[0] as { id: number; proximaFecha: string };
  };
  const leer = async (id: number) => (await api(tokens.auditor).get(`/api/mantenimientos/planes/${id}`).expect(200)).body;
  const programar = async (planId: number) => (await api(tokens.analista).post(`/api/mantenimientos/planes/${planId}/programar`).expect(201)).body.mantenimientoId as number;
  const completar = async (id: number, inicio: string, fin: string) => {
    await api(tokens.admin).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: inicio, tecnico: 'jperez', motivoExcepcion: MOTIVO }).expect(200);
    return api(tokens.admin)
      .patch(`/api/mantenimientos/${id}/finalizar`, {
        fechaFin: fin,
        resultado: 'Limpieza y revisión completas.',
        diagnostico: 'Sin novedades en el equipo.',
        duracionMin: 60,
        estadoEquipo: 'OPERATIVO',
        evidencia: 'Acta MT-01',
        repositorioVerificable: 'Carpeta Compartida TICs/Mantenimientos',
        motivoExcepcion: MOTIVO,
      })
      .then((r) => { if (r.status !== 200) throw new Error('finalizar ' + r.status + ' ' + JSON.stringify(r.body)); return r; });
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const categoriaId = (await prisma.categoria.create({ data: { nombre: 'Computadoras', descripcion: '', claseMantenimiento: 'HARDWARE', aplicaMantenimiento: true } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    activoId = (
      await prisma.activo.create({
        data: { codigo: 'PC-PROX-0', nombre: 'PC Contabilidad', categoriaId, criticidadId, sistemas: '', custodio: 'TIC', ubicacion: 'Piso 2', cifrado: true, ultimaRevision: new Date('2026-01-01'), estado: 'Bueno' },
      })
    ).id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  it('el ejemplo de la regla: plan trimestral; inicio real 12/01, fin real 15/01/2025 → próxima 15/04/2025', async () => {
    const p = await plan('TRIMESTRAL', ec('2025-01-05T08:00:00'));
    // Al crear: la próxima es la fecha de inicio planificada; aún no hay finalización.
    expect(await leer(p.id)).toMatchObject({ proximaFecha: ec('2025-01-05T08:00:00'), ultimaFinalizacion: null, ejecucionPendienteId: null, vencido: true });
    const id = await programar(p.id);
    // Programar NO mueve la próxima fecha; con la ejecución pendiente, el plan no figura vencido.
    expect(await leer(p.id)).toMatchObject({ proximaFecha: ec('2025-01-05T08:00:00'), ejecucionPendienteId: id, vencido: false });
    // Una segunda ejecución pendiente sin justificar: 409.
    await api(tokens.analista).post(`/api/mantenimientos/planes/${p.id}/programar`).expect(409);
    const res = await completar(id, ec('2025-01-12T09:00:00'), ec('2025-01-15T17:00:00'));
    expect(res.body.fase).toBe('FINALIZADO');
    expect(await leer(p.id)).toMatchObject({ proximaFecha: ec('2025-04-15T17:00:00'), ultimaFinalizacion: ec('2025-01-15T17:00:00'), ejecucionPendienteId: null });
  }, LENTO);

  it('cancelar no cambia la próxima fecha; corregir el fin real la recalcula (auditado); anular y revertir también', async () => {
    const p = await plan('MENSUAL', ec('2025-01-02T08:00:00'));
    const primera = await programar(p.id);
    await completar(primera, ec('2025-01-03T09:00:00'), ec('2025-01-31T22:00:00')); // de noche: 01/02 en UTC
    expect((await leer(p.id)).proximaFecha).toBe(ec('2025-02-28T22:00:00')); // fin de mes, sin desplazarse por UTC
    // Cancelar una nueva ejecución: la próxima sigue igual.
    const cancelada = await programar(p.id);
    await api(tokens.analista).patch(`/api/mantenimientos/${cancelada}/cancelar`, { motivo: 'El usuario no dejó el equipo ese día.' }).expect(200);
    expect((await leer(p.id)).proximaFecha).toBe(ec('2025-02-28T22:00:00'));
    // Corregir el fin real de la completada (solo admin, con motivo): se recalcula.
    await api(tokens.admin).patch(`/api/mantenimientos/${primera}/ejecucion`, { fechaFin: ec('2025-01-20T10:00:00'), motivoCambio: MOTIVO }).expect(200);
    expect((await leer(p.id)).proximaFecha).toBe(ec('2025-02-20T10:00:00'));
    const traza = (await api(tokens.auditor).get(`/api/trazas?entidad=MANTENIMIENTO&registroId=${primera}`).expect(200)).body as Array<{ motivo: string; cambios: Array<{ campo: string }> }>;
    expect(traza.some((t) => t.motivo === MOTIVO && t.cambios.some((c) => c.campo === 'fechaFin'))).toBe(true);
    // Anular la única completada: vuelve a la fecha de inicio; revertir la anulación la restituye.
    await api(tokens.admin).post(`/api/mantenimientos/${primera}/anular`, { motivo: MOTIVO }).expect(200);
    expect(await leer(p.id)).toMatchObject({ proximaFecha: ec('2025-01-02T08:00:00'), ultimaFinalizacion: null });
    await api(tokens.admin).post(`/api/mantenimientos/${primera}/reversar`, { motivo: MOTIVO }).expect(200);
    expect((await leer(p.id)).proximaFecha).toBe(ec('2025-02-20T10:00:00'));
  }, LENTO);

  it('cambiar el período del plan recalcula desde el último fin real; ÚNICA ya ejecutada no tiene próxima', async () => {
    const p = await plan('SEMESTRAL', ec('2025-03-01T08:00:00'));
    const id = await programar(p.id);
    await completar(id, ec('2025-03-02T09:00:00'), ec('2025-03-10T12:00:00'));
    expect((await leer(p.id)).proximaFecha).toBe(ec('2025-09-10T12:00:00'));
    await api(tokens.analista).patch(`/api/mantenimientos/planes/${p.id}`, { frecuencia: 'ANUAL', motivoCambio: MOTIVO }).expect(200);
    expect((await leer(p.id)).proximaFecha).toBe(ec('2026-03-10T12:00:00'));
    await api(tokens.analista).patch(`/api/mantenimientos/planes/${p.id}`, { frecuencia: 'UNICA', motivoCambio: MOTIVO }).expect(200);
    expect((await leer(p.id)).proximaFecha).toBeNull();
    // Sin más intervenciones: programar normal → 409; una adicional justificada sí.
    await api(tokens.analista).post(`/api/mantenimientos/planes/${p.id}/programar`).expect(409);
    await api(tokens.analista)
      .post(`/api/mantenimientos/planes/${p.id}/programar`, { adicional: true, fecha: ec('2025-04-01T08:00:00'), justificacion: 'Intervención correctiva adicional tras una falla.' })
      .expect(201);
    // La próxima intervención ya no se escribe a mano.
    await api(tokens.analista).patch(`/api/mantenimientos/planes/${p.id}`, { proximaFecha: ec('2025-12-01T08:00:00'), motivoCambio: MOTIVO }).expect(400);
  }, LENTO);

  it('concurrencia: dos programaciones simultáneas del mismo plan crean UNA sola ejecución pendiente', async () => {
    const p = await plan('TRIMESTRAL', ec('2025-05-01T08:00:00'));
    const respuestas = await Promise.all([
      api(tokens.analista).post(`/api/mantenimientos/planes/${p.id}/programar`),
      api(tokens.analista).post(`/api/mantenimientos/planes/${p.id}/programar`),
      api(tokens.analista).post('/api/mantenimientos', { planId: p.id, fecha: ec('2025-05-01T08:00:00') }),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409, 409]);
    expect(await prisma.mantenimiento.count({ where: { planId: p.id, fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] } } })).toBe(1);
  }, LENTO);
});
