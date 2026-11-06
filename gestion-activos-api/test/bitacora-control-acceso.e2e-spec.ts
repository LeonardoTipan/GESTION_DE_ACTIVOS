/**
 * Bitácora de Control de acceso (mensual, decisión del 06/11/2026): solicitudes de ALTA del mes
 * cerradas ÷ registradas; bajas aparte. Base gestion_activos_test, por la API real.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupSwagger } from './../src/swagger.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 90_000;
const base = {
  tipoAcceso: 'LOGICO',
  tipoSolicitud: 'ACCESO',
  nombreSolicitante: 'Jorge Andrade',
  cargoSolicitante: 'Jefe de Contabilidad',
  nombreUsuarioBeneficiario: 'María Pérez',
  departamento: 'Contabilidad',
  descripcion: 'Acceso al sistema contable para el cierre mensual.',
};

interface Periodo { numerador: number | null; denominador: number | null; porcentaje: number | null }

describe('Bitácora de Control de acceso (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const categoriaId = (await prisma.categoria.create({ data: { nombre: 'Programas', descripcion: '', admiteAccesoLogico: true, admiteAccesoFisico: false } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Media' } })).id;
    const activoId = (await prisma.activo.create({ data: { codigo: 'SW-1', nombre: 'Sistema contable', sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: false, ultimaRevision: new Date('2026-01-01'), categoriaId, criticidadId } })).id;
    const crear = async (clave: string, extra: object) =>
      (ids[clave] = (await request(app.getHttpServer()).post('/api/control-acceso').set('Authorization', `Bearer ${tokens.analista}`).send({ ...base, activoId, ...extra }).expect(201)).body.id);
    const cerrar = (clave: string, fechaAtendido: string) =>
      request(app.getHttpServer()).patch(`/api/control-acceso/${ids[clave]}/cerrar`).set('Authorization', `Bearer ${tokens.analista}`).send({ resolucion: 'Acceso atendido según el ticket.', fechaAtendido }).expect(200);
    // Marzo de 2026 (hora de Quito): 3 altas (2 cerradas) y 2 bajas (1 cerrada).
    await crear('alta1', { fechaSolicitud: '2026-03-02T15:00:00.000Z' });
    await crear('alta2', { fechaSolicitud: '2026-03-10T15:00:00.000Z', nombreUsuarioBeneficiario: 'Ana Torres' });
    await crear('alta3', { fechaSolicitud: '2026-03-20T15:00:00.000Z' });
    await crear('baja1', { fechaSolicitud: '2026-03-05T15:00:00.000Z', tipoSolicitud: 'BAJA' });
    await crear('baja2', { fechaSolicitud: '2026-03-06T15:00:00.000Z', tipoSolicitud: 'BAJA' });
    // 23:30 del 31 de marzo en Quito (04:30 UTC del 1 de abril): cuenta en MARZO.
    await crear('altaLimite', { fechaSolicitud: '2026-04-01T04:30:00.000Z' });
    await cerrar('alta1', '2026-03-03T15:00:00.000Z');
    // Solicitada en marzo y atendida en abril: cuenta como otorgada en marzo (su mes).
    await cerrar('alta2', '2026-04-02T15:00:00.000Z');
    await cerrar('baja1', '2026-03-07T15:00:00.000Z');
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token = tokens.auditor) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  it('general: altas cerradas ÷ altas registradas del mes; las bajas, aparte', async () => {
    const b = (await get('/api/control-acceso/bitacora/general?anio=2026').expect(200)).body as { indicador: { frecuencia: string }; periodos: Periodo[]; informativas: { etiqueta: string; valores: (number | null)[] }[] };
    expect(b.indicador.frecuencia).toBe('MENSUAL');
    expect(b.periodos[2]).toMatchObject({ numerador: 2, denominador: 4, porcentaje: 50 });
    expect(b.periodos[3]).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores[2];
    expect([inf('Altas pendientes de atender'), inf('Solicitudes de baja'), inf('Bajas atendidas')]).toEqual([2, 2, 1]);
  });

  it('específica: las solicitudes del mes y cómo cuenta cada una', async () => {
    const r = (await get('/api/control-acceso/bitacora/especifica?anio=2026&mes=3').expect(200)).body as { meta: { total: number }; data: { id: number; enIndicador: string; fechaAtendido: string | null }[] };
    expect(r.meta.total).toBe(6);
    const de = (k: string) => r.data.find((x) => x.id === ids[k])!;
    expect(de('alta1').enIndicador).toBe('OTORGADO');
    expect(de('alta2')).toMatchObject({ enIndicador: 'OTORGADO', fechaAtendido: '2026-04-02T15:00:00.000Z' });
    expect(de('alta3').enIndicador).toBe('PENDIENTE');
    expect(de('baja1').enIndicador).toBe('NO_APLICA');
    expect(de('altaLimite').enIndicador).toBe('PENDIENTE');
  });

  it('filtros del listado: tipo de solicitud, estado y búsqueda por persona', async () => {
    expect((await get('/api/control-acceso/bitacora/especifica?anio=2026&mes=3&tipoSolicitud=BAJA').expect(200)).body.meta.total).toBe(2);
    expect((await get('/api/control-acceso/bitacora/especifica?anio=2026&mes=3&estado=CERRADO').expect(200)).body.meta.total).toBe(3);
    const ana = (await get('/api/control-acceso/bitacora/especifica?anio=2026&q=Ana%20Torres').expect(200)).body;
    expect(ana.data.map((x: { id: number }) => x.id)).toEqual([ids.alta2]);
  });

  it('el historial de la solicitud registra la atención y quién la hizo', async () => {
    const h = (await get(`/api/control-acceso/${ids.alta2}/historial`).expect(200)).body as { campo: string; usuario: string }[];
    expect(h.some((x) => x.campo === 'estado' && x.usuario === 'analista.test')).toBe(true);
  });

  it('validación y permisos', async () => {
    await get('/api/control-acceso/bitacora/general').expect(400);
    await get('/api/control-acceso/bitacora/especifica?anio=2026&mes=0').expect(400);
    await get('/api/control-acceso/bitacora/general?anio=2026', tokens.admin).expect(200);
    await request(app.getHttpServer()).get('/api/control-acceso/bitacora/general?anio=2026').expect(401);
  });
});
