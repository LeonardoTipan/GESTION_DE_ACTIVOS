/**
 * Mantenimientos: el verificable y su repositorio son obligatorios para completar una ejecución
 * y al corregir una completada. Contra MySQL (gestion_activos_test) y el Keycloak de desarrollo.
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
const MOTIVO = 'Corrección documentada con el acta firmada del técnico.';
const INFORME = 'Informe MT-2026-031';
const CARPETA = 'Carpeta Compartida TICs/Mantenimientos';

describe('Mantenimientos · evidencia obligatoria al completar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let planId: number;

  const api = (token: string) => {
    const server = app.getHttpServer();
    return {
      post: (url: string, body: object = {}) => request(server).post(url).set('Authorization', `Bearer ${token}`).send(body),
      patch: (url: string, body: object = {}) => request(server).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    };
  };
  const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const BASE = () => ({ resultado: 'Limpieza y revisión completas.', estadoEquipo: 'OPERATIVO', tecnico: 'jperez', diagnostico: 'Sin novedades.', duracionMin: 30, fechaFin: hace(1) });
  /** Una ejecución en curso, lista para completarse. */
  const enCurso = async () => {
    const m = (await api(tokens.analista)
      .post('/api/mantenimientos', { planId, fecha: hace(120), fechaLimite: new Date(Date.now() + 86_400_000).toISOString(), adicional: true, justificacion: 'Ejecución auxiliar de la prueba de evidencia.' })
      .expect(201)).body as { id: number };
    await api(tokens.analista).patch(`/api/mantenimientos/${m.id}/iniciar`, { fechaInicio: hace(60), tecnico: 'jperez' }).expect(200);
    return m.id;
  };
  const finalizar = (id: number, extra: object) => api(tokens.analista).patch(`/api/mantenimientos/${id}/finalizar`, { ...BASE(), ...extra });

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
    const activo = await prisma.activo.create({
      data: { codigo: 'PC-EVID', nombre: 'PC Evidencia', categoriaId, criticidadId, sistemas: '', custodio: 'TIC', ubicacion: 'Piso 2', cifrado: true, ultimaRevision: new Date('2026-01-01'), estado: 'Bueno' },
    });
    planId = (await api(tokens.analista)
      .post('/api/mantenimientos/planes', { tipo: 'PREVENTIVO', frecuencia: 'TRIMESTRAL', fechaInicio: hace(600), responsable: 'Soporte TIC', actividades: 'Limpieza y revisión general.', activoIds: [activo.id] })
      .expect(201)).body[0].id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  it('1 · sin verificable → 400; la ejecución sigue en curso y sin próxima fecha nueva', async () => {
    const id = await enCurso();
    const antes = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } });
    const res = await finalizar(id, { repositorioVerificable: CARPETA }).expect(400);
    expect(res.body.message).toBe('Para completar el mantenimiento falta: el verificable (informe o evidencia de la ejecución).');
    expect(await prisma.mantenimiento.findUniqueOrThrow({ where: { id } })).toMatchObject({ fase: 'EN_EJECUCION', fechaFin: null });
    expect((await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } })).proximaFecha).toEqual(antes.proximaFecha);
  }, LENTO);

  it('2 · sin repositorio → 400', async () => {
    const res = await finalizar(await enCurso(), { evidencia: INFORME }).expect(400);
    expect(res.body.message).toBe('Para completar el mantenimiento falta: el repositorio del verificable.');
  }, LENTO);

  it('3 · con los dos vacíos o solo con espacios → 400, y la petición directa que los omite también', async () => {
    const id = await enCurso();
    const AMBOS = 'el verificable (informe o evidencia de la ejecución), el repositorio del verificable';
    expect((await finalizar(id, { evidencia: '', repositorioVerificable: '' }).expect(400)).body.message).toContain(AMBOS);
    expect((await finalizar(id, { evidencia: '   ', repositorioVerificable: '   ' }).expect(400)).body.message).toContain(AMBOS);
    expect((await finalizar(id, {}).expect(400)).body.message).toContain(AMBOS);
    // Un formato no válido tampoco.
    await finalizar(id, { evidencia: INFORME, repositorioVerificable: 'javascript:alert(1)' }).expect(400);
    // Ni siquiera el admin puede omitirlos.
    await api(tokens.admin).patch(`/api/mantenimientos/${id}/finalizar`, BASE()).expect(400);
  }, LENTO);

  it('4 · con los dos válidos → completada, con su evidencia y la próxima intervención desde el fin real', async () => {
    const id = await enCurso();
    const res = await finalizar(id, { evidencia: INFORME, repositorioVerificable: CARPETA }).expect(200);
    expect(res.body).toMatchObject({ fase: 'FINALIZADO', evidencia: INFORME, repositorioVerificable: CARPETA });
    const plan = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.proximaFecha!.getTime()).toBeGreaterThan(Date.now());
  }, LENTO);

  it('la evidencia ya guardada durante la ejecución cuenta al completar; enviarla vacía no la borra por la puerta de atrás', async () => {
    const id = await enCurso();
    await api(tokens.analista).patch(`/api/mantenimientos/${id}/ejecucion`, { evidencia: INFORME, repositorioVerificable: CARPETA, motivoCambio: MOTIVO }).expect(200);
    await finalizar(id, { evidencia: '   ' }).expect(400);
    await finalizar(id, {}).expect(200);
  }, LENTO);

  it('5 · corrección administrativa: una completada no puede quedarse sin evidencia', async () => {
    const id = await enCurso();
    await finalizar(id, { evidencia: INFORME, repositorioVerificable: CARPETA }).expect(200);
    const url = `/api/mantenimientos/${id}/ejecucion`;
    await api(tokens.analista).patch(url, { evidencia: 'Otro informe', motivoCambio: MOTIVO }).expect(403); // solo admin
    await api(tokens.admin).patch(url, { evidencia: '', motivoCambio: MOTIVO }).expect(400);
    await api(tokens.admin).patch(url, { repositorioVerificable: '   ', motivoCambio: MOTIVO }).expect(400);
    const res = await api(tokens.admin).patch(url, { evidencia: 'Informe MT-2026-032', motivoCambio: MOTIVO }).expect(200);
    expect(res.body).toMatchObject({ fase: 'FINALIZADO', evidencia: 'Informe MT-2026-032', repositorioVerificable: CARPETA });
  }, LENTO);

  it('6 · histórica sin evidencia: se conserva y se consulta; corregirla exige completarla', async () => {
    const id = await enCurso();
    // Registrada antes de la regla: se prepara directamente en la base de pruebas.
    await prisma.mantenimiento.update({
      where: { id },
      data: { fase: 'FINALIZADO', fechaFin: new Date(hace(5)), resultado: 'Trabajo histórico.', estadoEquipo: 'OPERATIVO', evidencia: null, repositorioVerificable: null },
    });
    const url = `/api/mantenimientos/${id}/ejecucion`;
    const res = await api(tokens.admin).patch(url, { tecnico: 'mlopez', motivoCambio: MOTIVO }).expect(400);
    expect(res.body.message).toContain('el verificable');
    expect(await prisma.mantenimiento.findUniqueOrThrow({ where: { id } })).toMatchObject({ tecnico: 'jperez', evidencia: null, repositorioVerificable: null });
    await api(tokens.admin).patch(url, { tecnico: 'mlopez', evidencia: INFORME, repositorioVerificable: CARPETA, motivoCambio: MOTIVO }).expect(200);
  }, LENTO);

  it('una ejecución en curso se puede corregir sin evidencia todavía (solo se exige al cerrar)', async () => {
    const id = await enCurso();
    await api(tokens.analista).patch(`/api/mantenimientos/${id}/ejecucion`, { tecnico: 'mlopez', motivoCambio: MOTIVO }).expect(200);
  }, LENTO);

  it('permisos: el auditor no completa (403)', async () => {
    const id = await enCurso();
    await api(tokens.auditor).patch(`/api/mantenimientos/${id}/finalizar`, { ...BASE(), evidencia: INFORME, repositorioVerificable: CARPETA }).expect(403);
  }, LENTO);
});
