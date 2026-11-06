/**
 * Bitácora de Respaldos (mensual, opción A del 06/11/2026) contra gestion_activos_test:
 * ventanas programadas cubiertas por una ejecución EXITOSA; pruebas de restauración aparte;
 * planes suspendidos conservan su histórico; los anulados no cuentan.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupSwagger } from './../src/swagger.js';
import { APLICA_EN_TODOS, limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 90_000;
const PLAN = {
  frecuencia: 'MENSUAL',
  tipo: 'COMPLETO',
  medio: 'CINTA_LTO8',
  ventana: 'NOCTURNA_22_02',
  retencion: 'ANIOS_3',
  frecuenciaPrueba: 'TRIMESTRAL',
  rpoHoras: 24,
  rtoMinutos: 240,
  responsable: 'Coordinación de Infraestructura',
  justificacion: 'Base de datos institucional de criticidad alta con información reservada.',
  vigenteDesde: '2026-01-01',
};
// 03:30 UTC = 22:30 del día anterior en Quito: se cuenta en el día local.
const noche = (dia: string) => new Date(`${dia}T03:30:00.000Z`);

interface Periodo { numerador: number | null; denominador: number | null; porcentaje: number | null }
interface Bitacora { indicador: { frecuencia: string; formula: string }; periodos: Periodo[]; informativas: { etiqueta: string; valores: (number | null)[] }[] }

describe('Bitácora de Respaldos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let planId: number;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const cat = await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Servidores', descripcion: '', claseMantenimiento: 'HARDWARE' } });
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'Infra', ubicacion: 'DC', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, categoriaId: cat.id };
    const erp = await prisma.activo.create({ data: { ...base, codigo: 'SRV-ERP', nombre: 'Servidor ERP' } });
    const web = await prisma.activo.create({ data: { ...base, codigo: 'SRV-WEB', nombre: 'Servidor web' } });
    const api = (await request(app.getHttpServer()).post('/api/respaldos/planes').set('Authorization', `Bearer ${tokens.admin}`).send({ ...PLAN, activoIds: [erp.id] }).expect(201)).body;
    planId = (Array.isArray(api) ? api[0] : api).id;
    const otro = (await request(app.getHttpServer()).post('/api/respaldos/planes').set('Authorization', `Bearer ${tokens.admin}`).send({ ...PLAN, activoIds: [web.id] }).expect(201)).body;
    const planAnulado = (Array.isArray(otro) ? otro[0] : otro).id;

    const ejec = (dia: string, resultado: 'EXITOSO' | 'PARCIAL' | 'FALLIDO', extra: object = {}) =>
      prisma.ejecucionRespaldo.create({
        data: { planId, activoId: erp.id, fecha: noche(dia), tipo: 'COMPLETO', medio: 'CINTA_LTO8', volumenGb: 10, duracionMin: 30, rpoHoras: 24, resultado, responsable: 'OPERADOR 1', cifrado: true, fueraSitio: true, inmutable: false, integridad: true, evidencia: `job-${dia}`, ...extra },
      });
    const enero = await ejec('2026-01-11', 'EXITOSO');
    await ejec('2026-02-11', 'FALLIDO');
    await ejec('2026-03-11', 'EXITOSO', { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registrada por error.' });
    await prisma.restauracion.create({
      data: { ejecucionId: enero.id, activoId: erp.id, fecha: noche('2026-01-21'), motivo: 'PRUEBA_PROGRAMADA', resultado: 'EXITOSO', tiempoRealMin: 60, rtoMinutos: 240, integridad: true, evidencia: 'Acta de restauración 01-2026', responsable: 'INFRA' },
    });
    await request(app.getHttpServer()).post(`/api/respaldos/planes/${planAnulado}/anular`).set('Authorization', `Bearer ${tokens.admin}`).send({ motivo: 'Plan registrado sobre el activo equivocado.' }).expect((r) => expect([200, 201]).toContain(r.status));
    // Se suspende HOY: los meses anteriores conservan sus ventanas.
    await request(app.getHttpServer()).patch(`/api/respaldos/planes/${planId}`).set('Authorization', `Bearer ${tokens.admin}`).send({ estado: 'SUSPENDIDO', motivoCambio: 'Servidor en migración al nuevo centro de datos.' }).expect(200);
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token = tokens.auditor) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  it('general mensual: solo la ventana cubierta por una EXITOSA está validada; fallidas y anuladas no', async () => {
    const b = (await get('/api/respaldos/bitacora/general?anio=2026').expect(200)).body as Bitacora;
    expect(b.indicador).toMatchObject({ frecuencia: 'MENSUAL', formula: 'Respaldo de seguridad validados / Total programados' });
    expect(b.periodos).toHaveLength(12);
    expect(b.periodos.slice(0, 3).map((p) => [p.numerador, p.denominador, p.porcentaje])).toEqual([[1, 1, 100], [0, 1, 0], [0, 1, 0]]);
    const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores;
    expect(inf('Pruebas de restauración exitosas')[0]).toBe(1);
    expect(inf('Ejecuciones fallidas o parciales').slice(0, 3)).toEqual([1 - 1, 1, 0]);
  });

  it('el plan suspendido hoy conserva sus ventanas pasadas; el anulado no aporta ninguna', async () => {
    const b = (await get('/api/respaldos/bitacora/general?anio=2026').expect(200)).body as Bitacora;
    // Un solo plan (el anulado no cuenta): una ventana por mes cerrado.
    expect(b.periodos.slice(3, 10).map((p) => p.denominador)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('específica: la ventana, la ejecución que la cubre y la prueba de restauración, por separado', async () => {
    const ene = (await get('/api/respaldos/bitacora/especifica?anio=2026&mes=1').expect(200)).body;
    expect(ene.data).toEqual([
      expect.objectContaining({
        planId,
        activo: expect.objectContaining({ codigo: 'SRV-ERP' }),
        situacion: 'CUMPLIDA',
        ejecucion: expect.objectContaining({ fecha: '2026-01-10', resultado: 'EXITOSO', responsable: 'OPERADOR 1' }),
        restauracion: expect.objectContaining({ fecha: '2026-01-20', resultado: 'EXITOSO', evidencia: 'Acta de restauración 01-2026' }),
      }),
    ]);
    const feb = (await get('/api/respaldos/bitacora/especifica?anio=2026&mes=2').expect(200)).body;
    expect(feb.data[0]).toMatchObject({ situacion: 'VENCIDA', noValidas: 1, ejecucion: { resultado: 'FALLIDO' }, restauracion: null });
    const mar = (await get('/api/respaldos/bitacora/especifica?anio=2026&mes=3').expect(200)).body;
    expect(mar.data[0]).toMatchObject({ situacion: 'VENCIDA', ejecucion: null });
  });

  it('filtros: situación, sistema y responsable', async () => {
    expect((await get('/api/respaldos/bitacora/especifica?anio=2026&situacion=CUMPLIDA').expect(200)).body.meta.total).toBe(1);
    expect((await get('/api/respaldos/bitacora/especifica?anio=2026&q=SRV-WEB').expect(200)).body.meta.total).toBe(0);
    expect((await get('/api/respaldos/bitacora/especifica?anio=2026&responsable=OPERADOR').expect(200)).body.meta.total).toBe(2);
  });

  it('validación y permisos: el año es obligatorio; todos los roles consultan', async () => {
    await get('/api/respaldos/bitacora/general').expect(400);
    await get('/api/respaldos/bitacora/especifica?anio=2026&mes=13').expect(400);
    await get('/api/respaldos/bitacora/general?anio=2026', tokens.analista).expect(200);
    await request(app.getHttpServer()).get('/api/respaldos/bitacora/general?anio=2026').expect(401);
  });
});
