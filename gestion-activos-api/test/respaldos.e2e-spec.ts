/**
 * Pruebas e2e del módulo de respaldos (3 capas) contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo.
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

describe('Respaldos en 3 capas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let activoDeBajaId: number;

  const EJECUCION_OK = {
    estadoEjecucion: 'EXITOSA',
    fechaEjecucion: '2026-09-29T02:00:00.000Z',
    rutaEvidencia: '\\\\nas01\\respaldos\\erp\\2026-09-29.log',
  };
  const PRUEBA_OK = {
    estadoPrueba: 'APROBADA',
    resultadoPrueba: 'Restauración completa en 42 min; datos íntegros.',
    fechaPrueba: '2026-09-29T10:00:00.000Z',
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();

    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const categoria = await prisma.categoria.create({
      data: { nombre: 'Hardware', descripcion: '' },
    });
    const criticidad = await prisma.criticidad.create({
      data: { nivel: 'Alta' },
    });
    const base = {
      nombre: 'Servidor ERP',
      sistemas: 'ERP',
      custodio: 'Infraestructura',
      ubicacion: 'Rack 3',
      cifrado: true,
      ultimaRevision: new Date('2026-09-01'),
      categoriaId: categoria.id,
      criticidadId: criticidad.id,
    };
    activoId = (
      await prisma.activo.create({ data: { ...base, codigo: 'SRV-ERP' } })
    ).id;
    activoDeBajaId = (
      await prisma.activo.create({
        data: { ...base, codigo: 'SRV-OLD', deletedAt: new Date() },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = (token: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object) =>
        auth(request(server).post(url).send(body)),
      patch: (url: string, body: object) =>
        auth(request(server).patch(url).send(body)),
    };
  };

  const crearRespaldo = async (alcance = 'Base de datos ERP completa') =>
    (
      await api(tokens.analista)
        .post('/api/respaldos', { activoId, alcanceDetalle: alcance })
        .expect(201)
    ).body as { id: number };

  describe('ciclo de vida completo: alcance → ejecución → prueba', () => {
    let id: number;

    it('Capa 1: el analista define el alcance → 201, etapa PENDIENTE_EJECUCION', async () => {
      const res = await api(tokens.analista)
        .post('/api/respaldos', {
          activoId,
          alcanceDetalle: '  Base de datos ERP completa  ',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        activoId,
        activo: { id: activoId, codigo: 'SRV-ERP', nombre: 'Servidor ERP' },
        alcanceDetalle: 'Base de datos ERP completa',
        etapa: 'PENDIENTE_EJECUCION',
        estadoEjecucion: 'PENDIENTE',
        fechaEjecucion: null,
        rutaEvidencia: null,
        estadoPrueba: 'PENDIENTE',
        resultadoPrueba: null,
        fechaPrueba: null,
      });
      id = res.body.id;
    });

    it('no se puede probar antes de ejecutar → 409', () =>
      api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, PRUEBA_OK)
        .expect(409));

    it('Capa 2: registra la ejecución EXITOSA → etapa PENDIENTE_PRUEBA', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(200);
      expect(res.body).toMatchObject({
        etapa: 'PENDIENTE_PRUEBA',
        estadoEjecucion: 'EXITOSA',
        fechaEjecucion: EJECUCION_OK.fechaEjecucion,
        rutaEvidencia: EJECUCION_OK.rutaEvidencia,
      });
    });

    it('la ejecución no se puede registrar dos veces → 409', () =>
      api(tokens.admin)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(409));

    it('la prueba no puede ser anterior a la ejecución → 400', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, {
          ...PRUEBA_OK,
          fechaPrueba: '2026-09-28T00:00:00.000Z',
        })
        .expect(400);
      expect(res.body.message).toMatch(/anterior a la de la ejecución/);
    });

    it('Capa 3: registra la prueba APROBADA → etapa COMPLETADO', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, PRUEBA_OK)
        .expect(200);
      expect(res.body).toMatchObject({
        etapa: 'COMPLETADO',
        estadoPrueba: 'APROBADA',
        resultadoPrueba: PRUEBA_OK.resultadoPrueba,
        fechaPrueba: PRUEBA_OK.fechaPrueba,
      });
    });

    it('la prueba no se puede registrar dos veces → 409', () =>
      api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, PRUEBA_OK)
        .expect(409));
  });

  describe('ramas de fallo', () => {
    it('ejecución FALLIDA → etapa EJECUCION_FALLIDA y ya no admite prueba (409)', async () => {
      const { id } = await crearRespaldo('Archivos compartidos');
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, {
          ...EJECUCION_OK,
          estadoEjecucion: 'FALLIDA',
        })
        .expect(200);
      expect(res.body.etapa).toBe('EJECUCION_FALLIDA');
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, PRUEBA_OK)
        .expect(409);
    });

    it('prueba FALLIDA → etapa PRUEBA_FALLIDA', async () => {
      const { id } = await crearRespaldo('Configuración de red');
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}/prueba`, {
          ...PRUEBA_OK,
          estadoPrueba: 'FALLIDA',
          resultadoPrueba: 'El archivo de respaldo está corrupto.',
        })
        .expect(200);
      expect(res.body.etapa).toBe('PRUEBA_FALLIDA');
    });
  });

  describe('validaciones', () => {
    it('activo inexistente o dado de baja → 400', async () => {
      await api(tokens.analista)
        .post('/api/respaldos', { activoId: 999999, alcanceDetalle: 'X' })
        .expect(400);
      const res = await api(tokens.analista)
        .post('/api/respaldos', {
          activoId: activoDeBajaId,
          alcanceDetalle: 'X',
        })
        .expect(400);
      expect(res.body.message).toMatch(/dado de baja/);
    });

    it('al crear no se aceptan campos de otras capas → 400', () =>
      api(tokens.analista)
        .post('/api/respaldos', {
          activoId,
          alcanceDetalle: 'X',
          estadoEjecucion: 'EXITOSA',
        })
        .expect(400));

    it('ejecución: estado PENDIENTE, sin evidencia o con fecha futura → 400', async () => {
      const { id } = await crearRespaldo('Validaciones');
      const url = `/api/respaldos/${id}/ejecucion`;
      await api(tokens.analista)
        .patch(url, { ...EJECUCION_OK, estadoEjecucion: 'PENDIENTE' })
        .expect(400);
      await api(tokens.analista)
        .patch(url, { ...EJECUCION_OK, rutaEvidencia: undefined })
        .expect(400);
      const futura = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await api(tokens.analista)
        .patch(url, { ...EJECUCION_OK, fechaEjecucion: futura })
        .expect(400);
      expect(res.body.message).toContain(
        'fechaEjecucion no puede estar en el futuro',
      );
    });

    it('respaldo inexistente → 404; id no numérico → 400', async () => {
      await api(tokens.auditor).get('/api/respaldos/999999').expect(404);
      await api(tokens.analista)
        .patch('/api/respaldos/999999/ejecucion', EJECUCION_OK)
        .expect(404);
      await api(tokens.auditor).get('/api/respaldos/abc').expect(400);
    });
  });

  describe('permisos por rol', () => {
    it('el auditor puede consultar pero no registrar ninguna capa → 403', async () => {
      const { id } = await crearRespaldo('Permisos');
      await api(tokens.auditor).get(`/api/respaldos/${id}`).expect(200);
      await api(tokens.auditor)
        .post('/api/respaldos', { activoId, alcanceDetalle: 'X' })
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/respaldos/${id}/prueba`, PRUEBA_OK)
        .expect(403);
    });
  });

  describe('consulta (GET /api/respaldos)', () => {
    it('lista paginada, del más reciente al más antiguo, con etapa calculada', async () => {
      const res = await api(tokens.auditor)
        .get('/api/respaldos?limit=2')
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(5);
      const [primero, segundo] = res.body.data;
      expect(new Date(primero.createdAt) >= new Date(segundo.createdAt)).toBe(
        true,
      );
    });

    it('filtro por etapa: los que falta probar (PENDIENTE_PRUEBA)', async () => {
      const { id } = await crearRespaldo('Pendiente de prueba');
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(200);
      const res = await api(tokens.auditor)
        .get('/api/respaldos?etapa=PENDIENTE_PRUEBA')
        .expect(200);
      expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([id]);
    });

    it('filtros por activo y por estado', async () => {
      const porActivo = await api(tokens.auditor)
        .get(`/api/respaldos?activoId=${activoId}`)
        .expect(200);
      expect(
        porActivo.body.data.every(
          (r: { activoId: number }) => r.activoId === activoId,
        ),
      ).toBe(true);

      const fallidas = await api(tokens.auditor)
        .get('/api/respaldos?estadoEjecucion=FALLIDA')
        .expect(200);
      expect(fallidas.body.meta.total).toBe(1);
    });

    it('?actualizadoDesde devuelve solo lo modificado después de esa fecha', async () => {
      const { id } = await crearRespaldo('Sincronización');
      const desde = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, EJECUCION_OK)
        .expect(200);
      const res = await api(tokens.auditor)
        .get(`/api/respaldos?actualizadoDesde=${encodeURIComponent(desde)}`)
        .expect(200);
      expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([id]);
    });

    it('filtros inválidos → 400', async () => {
      await api(tokens.auditor)
        .get('/api/respaldos?etapa=TERMINADO')
        .expect(400);
      await api(tokens.auditor)
        .get('/api/respaldos?estadoEjecucion=OK')
        .expect(400);
    });
  });

  it('Swagger documenta las rutas de respaldos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/respaldos',
        '/api/respaldos/{id}',
        '/api/respaldos/{id}/ejecucion',
        '/api/respaldos/{id}/prueba',
      ]),
    );
  });
});
