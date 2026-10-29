/**
 * Fase 1 de Protección de Endpoints (períodos mensuales) y de Evaluación de Sistemas
 * Productivos (planificación) contra MySQL (gestion_activos_test) y el Keycloak de desarrollo.
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

const LENTO = 30_000;

describe('Protección de Endpoints y Evaluación de Sistemas Productivos · fase 1 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = {} as Record<'sistema' | 'otroSistema' | 'pc' | 'sistemaBaja' | 'monitor', number>;

  const api = (token?: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
    };
  };
  // Mes en curso en la hora de la institución.
  const [anioHoy, mesHoy] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  const mesAnterior = mesHoy === 1 ? { anio: anioHoy - 1, mes: 12 } : { anio: anioHoy, mes: mesHoy - 1 };
  const mesSiguiente = mesHoy === 12 ? { anio: anioHoy + 1, mes: 1 } : { anio: anioHoy, mes: mesHoy + 1 };
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const evaluacion = (activoId: number, extra: object = {}) => ({
    activoId,
    fechaProgramadaProduccion: enDias(10),
    responsable: 'Seguridad TIC',
    descripcion: 'Versión 2.1: pruebas de autenticación y autorización.',
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const aplicativos = (await prisma.categoria.create({ data: { nombre: 'Aplicativos', descripcion: '', claseMantenimiento: 'SOFTWARE', aplicaEvaluacion: true } })).id;
    const computadoras = (await prisma.categoria.create({ data: { nombre: 'Computadoras', descripcion: '', claseMantenimiento: 'HARDWARE', aplicaEndpoint: true, aplicaMantenimiento: true } })).id;
    const monitores = (await prisma.categoria.create({ data: { nombre: 'Monitores', descripcion: '', claseMantenimiento: 'HARDWARE' } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    const activo = async (codigo: string, categoriaId: number, extra: object = {}) =>
      (await prisma.activo.create({ data: { ...base, codigo, nombre: codigo, categoriaId, ...extra } })).id;
    ids.sistema = await activo('APL-NOMINA', aplicativos);
    ids.otroSistema = await activo('APL-PORTAL', aplicativos);
    ids.sistemaBaja = await activo('APL-VIEJO', aplicativos, { deletedAt: new Date() });
    ids.pc = await activo('PC-01', computadoras);
    ids.monitor = await activo('MON-01', monitores);
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  describe('el inventario sigue siendo general; cada módulo filtra su selector', () => {
    it('sin «aplica» se ven todos los operativos; con «aplica» solo los de categorías habilitadas', async () => {
      const codigos = async (consulta: string) =>
        (await api(tokens.auditor).get(`/api/activos?operativos=true&limit=100${consulta}`).expect(200)).body.data.map((a: { codigo: string }) => a.codigo).sort();
      expect(await codigos('')).toEqual(['APL-NOMINA', 'APL-PORTAL', 'MON-01', 'PC-01']);
      expect(await codigos('&aplica=EVALUACION')).toEqual(['APL-NOMINA', 'APL-PORTAL']);
      expect(await codigos('&aplica=ENDPOINT')).toEqual(['PC-01']);
      // El inventario completo (sin «operativos») también incluye el dado de baja.
      expect((await api(tokens.auditor).get('/api/activos?limit=100').expect(200)).body.meta.total).toBe(5);
    });
  });

  describe('Protección de Endpoints · apertura del período mensual', () => {
    it('abre el mes en curso (ABIERTO) y deja la traza de alta', async () => {
      const res = await api(tokens.analista)
        .post('/api/proteccion-endpoints/periodos', { anio: anioHoy, mes: mesHoy, responsable: 'Soporte TIC', observacion: 'Corte con el inventario de GLPI.' })
        .expect(201);
      expect(res.body).toMatchObject({ anio: anioHoy, mes: mesHoy, responsable: 'Soporte TIC', estado: 'ABIERTO', anuladoEn: null });
      const trazas = await api(tokens.auditor).get(`/api/trazas?entidad=PERIODO_ENDPOINT&registroId=${res.body.id}`).expect(200);
      expect(trazas.body[0]).toMatchObject({ accion: 'REGISTRAR', responsable: 'analista.test' });
    });

    it('no duplica el mismo mes (409) ni abre meses futuros (400)', async () => {
      const dup = await api(tokens.admin).post('/api/proteccion-endpoints/periodos', { anio: anioHoy, mes: mesHoy, responsable: 'Otro' }).expect(409);
      expect(dup.body.message).toMatch(/ya existe/);
      await api(tokens.admin).post('/api/proteccion-endpoints/periodos', { ...mesSiguiente, responsable: 'Soporte TIC' }).expect(400);
      expect(await prisma.periodoEndpoint.count()).toBe(1);
    });

    it('valida los datos: mes 1–12, año y responsable obligatorios; no admite campos de la fase 2', async () => {
      await api(tokens.admin).post('/api/proteccion-endpoints/periodos', { anio: anioHoy, mes: 13, responsable: 'X' }).expect(400);
      await api(tokens.admin).post('/api/proteccion-endpoints/periodos', { anio: anioHoy, mes: 1 }).expect(400);
      await api(tokens.admin)
        .post('/api/proteccion-endpoints/periodos', { ...mesAnterior, responsable: 'Soporte TIC', totalActivos: 10, conAntivirus: 9 })
        .expect(400);
    });

    it('un mes anterior se puede abrir (carga histórica); el listado los ordena y filtra por año', async () => {
      await api(tokens.analista).post('/api/proteccion-endpoints/periodos', { ...mesAnterior, responsable: 'Soporte TIC' }).expect(201);
      const lista = await api(tokens.auditor).get('/api/proteccion-endpoints/periodos').expect(200);
      expect(lista.body.meta.total).toBe(2);
      expect(lista.body.data.map((p: { anio: number; mes: number }) => p.anio * 12 + p.mes)).toEqual([anioHoy * 12 + mesHoy, mesAnterior.anio * 12 + mesAnterior.mes]);
      const otroAnio = await api(tokens.auditor).get('/api/proteccion-endpoints/periodos?anio=2001').expect(200);
      expect(otroAnio.body.meta.total).toBe(0);
    });

    it('permisos: el auditor consulta pero no abre (403); sin sesión, 401', async () => {
      await api(tokens.auditor).post('/api/proteccion-endpoints/periodos', { anio: 2020, mes: 1, responsable: 'X' }).expect(403);
      await api().get('/api/proteccion-endpoints/periodos').expect(401);
      expect(await prisma.periodoEndpoint.count({ where: { anio: 2020 } })).toBe(0);
    });
  });

  describe('Evaluación de Sistemas Productivos · planificación', () => {
    it('planifica sobre un sistema elegible (ABIERTO) con la fecha programada de paso a producción', async () => {
      const res = await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.sistema)).expect(201);
      expect(res.body).toMatchObject({ activoId: ids.sistema, estado: 'ABIERTO', responsable: 'Seguridad TIC', vencida: false });
      expect(res.body.activo).toMatchObject({ codigo: 'APL-NOMINA' });
      expect(res.body).not.toHaveProperty('fechaSolicitud');
      const trazas = await api(tokens.auditor).get(`/api/trazas?entidad=EVALUACION_SISTEMA&registroId=${res.body.id}`).expect(200);
      expect(trazas.body[0]).toMatchObject({ accion: 'REGISTRAR', responsable: 'analista.test' });
    });

    it('el backend exige la categoría habilitada y el activo operativo, sin cambiarlos', async () => {
      const noAplica = await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.pc)).expect(400);
      expect(noAplica.body.message).toMatch(/no está habilitada para Evaluación de Sistemas Productivos/);
      const baja = await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.sistemaBaja)).expect(400);
      expect(baja.body.message).toMatch(/no está operativo/);
      expect(await prisma.activo.findUniqueOrThrow({ where: { id: ids.pc } })).toMatchObject({ deletedAt: null });
    });

    it('una sola evaluación pendiente por sistema (409)', async () => {
      const res = await api(tokens.admin).post('/api/evaluaciones-sistemas', evaluacion(ids.sistema)).expect(409);
      expect(res.body.message).toMatch(/ya tiene una evaluación pendiente/);
    });

    it('valida: fecha programada obligatoria, descripción de al menos 10 caracteres, sin campos de la fase 2', async () => {
      await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.otroSistema, { fechaProgramadaProduccion: undefined })).expect(400);
      await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.otroSistema, { descripcion: 'corta' })).expect(400);
      await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.otroSistema, { fechaPruebas: enDias(-1) })).expect(400);
      expect(await prisma.evaluacionSistema.count()).toBe(1);
    });

    it('listado: pendientes, vencidas (fecha programada pasada) y búsqueda por sistema', async () => {
      await api(tokens.analista).post('/api/evaluaciones-sistemas', evaluacion(ids.otroSistema, { fechaProgramadaProduccion: enDias(-2) })).expect(201);
      const todas = await api(tokens.auditor).get('/api/evaluaciones-sistemas').expect(200);
      expect(todas.body.data.map((e: { activo: { codigo: string } }) => e.activo.codigo)).toEqual(['APL-PORTAL', 'APL-NOMINA']);
      const vencidas = await api(tokens.auditor).get('/api/evaluaciones-sistemas?vencidas=true').expect(200);
      expect(vencidas.body.data.map((e: { activo: { codigo: string }; vencida: boolean }) => [e.activo.codigo, e.vencida])).toEqual([['APL-PORTAL', true]]);
      const buscar = await api(tokens.auditor).get('/api/evaluaciones-sistemas?q=NOMINA').expect(200);
      expect(buscar.body.meta.total).toBe(1);
    });

    it('permisos: el auditor consulta pero no planifica (403); sin sesión, 401', async () => {
      await api(tokens.auditor).post('/api/evaluaciones-sistemas', evaluacion(ids.otroSistema)).expect(403);
      await api().get('/api/evaluaciones-sistemas').expect(401);
    });
  });

  it('Swagger documenta las dos API nuevas', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(body.paths['/api/proteccion-endpoints/periodos']).toHaveProperty('post');
    expect(body.paths['/api/evaluaciones-sistemas']).toHaveProperty('post');
    expect(body.paths['/api/activos'].get.parameters.find((p: { name: string }) => p.name === 'aplica').schema.enum).toEqual(
      expect.arrayContaining(['EVALUACION', 'ENDPOINT']),
    );
  });
});
