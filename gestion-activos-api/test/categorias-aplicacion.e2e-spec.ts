/**
 * Elegibilidad de las categorías por módulo (Catálogos > Categorías) contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo: configuración de las banderas,
 * filtro de los selectores y validación en el backend al crear registros.
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
const BANDERAS = ['aplicaMantenimiento', 'aplicaVulnerabilidad', 'aplicaRenovacion', 'aplicaEvaluacion', 'aplicaEndpoint', 'aplicaRespaldo'] as const;

describe('Categorías: elegibilidad de los activos por módulo (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = {} as Record<'equipos' | 'monitores' | 'licencias' | 'pc' | 'monitor' | 'licencia' | 'pcBaja', number>;

  const api = (token: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
    };
  };
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
  const plan = (activoIds: number[]) => ({
    tipo: 'PREVENTIVO', frecuencia: 'SEMESTRAL', fechaInicio: hace(-3), plazoDias: 7,
    responsable: 'Soporte TIC', actividades: 'Limpieza y revisión general del equipo.', activoIds,
  });
  const vulnerabilidad = (activoId: number) => ({
    activoId, fecha: hace(1), descripcion: 'Versión vulnerable del servicio', nivelRiesgo: 'ALTO', responsable: 'ANALISTA 1',
  });
  const renovacion = (activoId: number) => ({
    activoId, tipo: 'LICENCIA', responsable: 'ANALISTA 1', fechaPlanificada: hace(-5).slice(0, 10), fechaCaducidadActual: hace(-30).slice(0, 10),
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
    // Equipos: los tres módulos. Monitores: solo mantenimiento. Licencias: solo renovaciones.
    ids.equipos = (await prisma.categoria.create({ data: { nombre: 'Computadoras', descripcion: '', claseMantenimiento: 'HARDWARE', aplicaMantenimiento: true, aplicaVulnerabilidad: true, aplicaRenovacion: true } })).id;
    ids.monitores = (await prisma.categoria.create({ data: { nombre: 'Monitores', descripcion: '', claseMantenimiento: 'HARDWARE', aplicaMantenimiento: true } })).id;
    ids.licencias = (await prisma.categoria.create({ data: { nombre: 'Licencias', descripcion: '', claseMantenimiento: 'SOFTWARE', aplicaRenovacion: true } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: false, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    const activo = async (codigo: string, categoriaId: number, extra: object = {}) =>
      (await prisma.activo.create({ data: { ...base, codigo, nombre: codigo, categoriaId, ...extra } })).id;
    ids.pc = await activo('PC-01', ids.equipos);
    ids.monitor = await activo('MON-01', ids.monitores);
    ids.licencia = await activo('LIC-01', ids.licencias);
    ids.pcBaja = await activo('PC-BAJA', ids.equipos, { deletedAt: new Date() });
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  describe('configuración en Catálogos > Categorías', () => {
    it('la API devuelve las cinco banderas de cada categoría', async () => {
      const res = await api(tokens.auditor).get('/api/categorias').expect(200);
      const equipos = res.body.find((c: { id: number }) => c.id === ids.equipos);
      expect(equipos).toMatchObject({ aplicaMantenimiento: true, aplicaVulnerabilidad: true, aplicaRenovacion: true, aplicaEvaluacion: false, aplicaEndpoint: false });
    });

    it('crear: sin banderas quedan en false; con banderas se guardan', async () => {
      const sin = await api(tokens.admin).post('/api/categorias', { nombre: 'Racks', descripcion: '' }).expect(201);
      for (const b of BANDERAS) expect(sin.body[b]).toBe(false);
      const con = await api(tokens.admin).post('/api/categorias', { nombre: 'Aplicativos', descripcion: '', aplicaEvaluacion: true, aplicaVulnerabilidad: true }).expect(201);
      expect(con.body).toMatchObject({ aplicaEvaluacion: true, aplicaVulnerabilidad: true, aplicaMantenimiento: false });
    });

    it('actualizar: cada bandera es independiente y persiste (al volver a consultar)', async () => {
      const res = await api(tokens.admin).patch(`/api/categorias/${ids.monitores}`, { aplicaEndpoint: true }).expect(200);
      expect(res.body).toMatchObject({ aplicaEndpoint: true, aplicaMantenimiento: true, aplicaVulnerabilidad: false });
      const lista = await api(tokens.auditor).get('/api/categorias').expect(200);
      expect(lista.body.find((x: { id: number }) => x.id === ids.monitores)).toMatchObject({ aplicaEndpoint: true, aplicaMantenimiento: true });
      await api(tokens.admin).patch(`/api/categorias/${ids.monitores}`, { aplicaEndpoint: false }).expect(200);
      expect(await prisma.categoria.findUniqueOrThrow({ where: { id: ids.monitores } })).toMatchObject({ aplicaEndpoint: false, aplicaMantenimiento: true });
    });

    it('solo el admin la cambia (analista y auditor: 403) y el valor debe ser booleano (400)', async () => {
      await api(tokens.analista).patch(`/api/categorias/${ids.monitores}`, { aplicaVulnerabilidad: true }).expect(403);
      await api(tokens.auditor).patch(`/api/categorias/${ids.monitores}`, { aplicaVulnerabilidad: true }).expect(403);
      await api(tokens.admin).patch(`/api/categorias/${ids.monitores}`, { aplicaVulnerabilidad: 'si' }).expect(400);
      expect(await prisma.categoria.findUniqueOrThrow({ where: { id: ids.monitores } })).toMatchObject({ aplicaVulnerabilidad: false });
    });
  });

  describe('selectores: solo activos operativos de categorías habilitadas', () => {
    const codigos = async (aplica: string) =>
      (await api(tokens.analista).get(`/api/activos?operativos=true&aplica=${aplica}&limit=100`).expect(200)).body.data.map((a: { codigo: string }) => a.codigo).sort();

    it('cada módulo ve solo sus categorías; los dados de baja siguen fuera', async () => {
      expect(await codigos('MANTENIMIENTO')).toEqual(['MON-01', 'PC-01']);
      expect(await codigos('VULNERABILIDAD')).toEqual(['PC-01']);
      expect(await codigos('RENOVACION')).toEqual(['LIC-01', 'PC-01']);
    });

    it('las categorías del selector también se filtran por módulo', async () => {
      const res = await api(tokens.analista).get('/api/activos/categorias?operativos=true&aplica=VULNERABILIDAD').expect(200);
      expect(res.body).toEqual([{ categoriaId: ids.equipos, nombre: 'Computadoras', total: 1 }]);
    });

    it('sin «aplica» el inventario sigue siendo general; un módulo desconocido → 400', async () => {
      const todos = (await api(tokens.analista).get('/api/activos?operativos=true&limit=100').expect(200)).body.meta.total;
      expect(todos).toBe(3);
      await api(tokens.analista).get('/api/activos?aplica=OTRO').expect(400);
      await api(tokens.analista).get('/api/activos/categorias?aplica=OTRO').expect(400);
    });
  });

  describe('validación en el backend al crear', () => {
    it('Mantenimientos: planificar un activo de categoría no habilitada → 400, sin crear nada', async () => {
      const res = await api(tokens.analista).post('/api/mantenimientos/planes', plan([ids.licencia])).expect(400);
      expect(res.body.message).toMatch(/categoría «Licencias», que no está habilitada para Mantenimientos/);
      expect(await prisma.planMantenimiento.count()).toBe(0);
      await api(tokens.analista).post('/api/mantenimientos/planes', plan([ids.monitor])).expect(201);
    });

    it('Vulnerabilidades: hardware o software, según la configuración (no por la clase); también en lote', async () => {
      const res = await api(tokens.analista).post('/api/vulnerabilidades', vulnerabilidad(ids.monitor)).expect(400);
      expect(res.body.message).toMatch(/no está habilitada para Vulnerabilidades/);
      await api(tokens.analista).post('/api/vulnerabilidades/lote', { ...vulnerabilidad(0), activoId: undefined, activoIds: [ids.pc, ids.licencia] }).expect(400);
      expect(await prisma.vulnerabilidad.count()).toBe(0);
      await api(tokens.analista).post('/api/vulnerabilidades', vulnerabilidad(ids.pc)).expect(201);
      // Una categoría de SOFTWARE habilitada por el admin también vale.
      await api(tokens.admin).patch(`/api/categorias/${ids.licencias}`, { aplicaVulnerabilidad: true }).expect(200);
      await api(tokens.analista).post('/api/vulnerabilidades', vulnerabilidad(ids.licencia)).expect(201);
    });

    it('Renovaciones: crear y cambiar el sistema exigen categoría habilitada', async () => {
      await api(tokens.analista).post('/api/renovaciones', renovacion(ids.monitor)).expect(400);
      const r = await api(tokens.analista).post('/api/renovaciones', renovacion(ids.licencia)).expect(201);
      const res = await api(tokens.analista)
        .patch(`/api/renovaciones/${r.body.id}`, { activoId: ids.monitor, motivoCambio: 'Se registró sobre el activo equivocado.' })
        .expect(400);
      expect(res.body.message).toMatch(/no está habilitada para Renovaciones/);
      expect((await prisma.renovacion.findUniqueOrThrow({ where: { id: r.body.id } })).activoId).toBe(ids.licencia);
    });

    it('la regla de activo operativo se conserva: un dado de baja se rechaza aunque su categoría aplique', async () => {
      const res = await api(tokens.analista).post('/api/vulnerabilidades', vulnerabilidad(ids.pcBaja)).expect(400);
      expect(res.body.message).toMatch(/no está operativo/);
    });
  });

  describe('registros existentes cuando la categoría deja de aplicar', () => {
    it('se conservan y se pueden seguir gestionando; solo se impiden registros nuevos', async () => {
      const v = await prisma.vulnerabilidad.findFirstOrThrow({ where: { activoId: ids.pc } });
      const p = await prisma.planMantenimiento.findFirstOrThrow({ where: { activoId: ids.monitor } });
      await api(tokens.admin).patch(`/api/categorias/${ids.equipos}`, { aplicaVulnerabilidad: false }).expect(200);
      await api(tokens.admin).patch(`/api/categorias/${ids.monitores}`, { aplicaMantenimiento: false }).expect(200);

      // El registro existente sigue visible y operable…
      await api(tokens.auditor).get(`/api/vulnerabilidades/${v.id}`).expect(200);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${v.id}/iniciar`, {}).expect(200);
      // …pero no se crean registros nuevos para ese activo.
      await api(tokens.analista).post('/api/vulnerabilidades', vulnerabilidad(ids.pc)).expect(400);
      await api(tokens.analista).post(`/api/mantenimientos/planes/${p.id}/programar`, {}).expect(400);
      // Ni la categoría ni el activo se modifican solos.
      expect(await prisma.activo.findUniqueOrThrow({ where: { id: ids.pc } })).toMatchObject({ categoriaId: ids.equipos, deletedAt: null });
      expect(await prisma.vulnerabilidad.count({ where: { id: v.id } })).toBe(1);
    }, LENTO);
  });

  it('Respaldos (aplicaRespaldo): el selector filtra y el backend exige la bandera al crear el plan; el inventario sigue completo', async () => {
    const plan = {
      frecuencia: 'MENSUAL', tipo: 'COMPLETO', medio: 'CINTA_LTO8', ventana: 'NOCTURNA_22_02', retencion: 'ANIOS_3', frecuenciaPrueba: 'TRIMESTRAL',
      rpoHoras: 24, rtoMinutos: 240, responsable: 'Infraestructura', justificacion: 'Servidor con información institucional reservada.',
      vigenteDesde: new Date().toISOString().slice(0, 10),
    };
    // Ninguna categoría del escenario tiene la bandera: el selector del módulo queda vacío.
    expect((await api(tokens.auditor).get('/api/activos?operativos=true&aplica=RESPALDO').expect(200)).body.meta.total).toBe(0);
    const rechazo = await api(tokens.analista).post('/api/respaldos/planes', { ...plan, activoIds: [ids.pc] }).expect(400);
    expect(rechazo.body.message).toContain('no está habilitada para Respaldos');
    // El admin la habilita en Catálogos: solo esa bandera cambia y el plan se acepta.
    await api(tokens.admin).patch(`/api/categorias/${ids.equipos}`, { aplicaRespaldo: true }).expect(200);
    const equipos = (await api(tokens.auditor).get('/api/categorias').expect(200)).body.find((c: { id: number }) => c.id === ids.equipos);
    expect(equipos).toMatchObject({ aplicaRespaldo: true, aplicaMantenimiento: true, aplicaEvaluacion: false });
    // Catálogos queda en la auditoría común: solo el campo que cambió, con antes y después y el usuario.
    const trazas = (await api(tokens.auditor).get(`/api/trazas?entidad=CATEGORIA&registroId=${ids.equipos}`).expect(200)).body;
    expect(trazas[0]).toMatchObject({ accion: 'MODIFICAR', responsable: 'admin.test', cambios: [{ campo: 'aplicaRespaldo', antes: false, despues: true }] });
    expect((await api(tokens.auditor).get('/api/activos?operativos=true&aplica=RESPALDO').expect(200)).body.data.map((a: { codigo: string }) => a.codigo)).toEqual(['PC-01']);
    await api(tokens.analista).post('/api/respaldos/planes', { ...plan, activoIds: [ids.pc] }).expect(201);
    // El inventario general no se filtra.
    expect((await api(tokens.auditor).get('/api/activos?limit=100').expect(200)).body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('Swagger documenta las banderas y el filtro «aplica»', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(body.components.schemas.CategoriaDto.properties)).toEqual(expect.arrayContaining([...BANDERAS]));
    const parametros = body.paths['/api/activos'].get.parameters.map((p: { name: string }) => p.name);
    expect(parametros).toContain('aplica');
  });
});
