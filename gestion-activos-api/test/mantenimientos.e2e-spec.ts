/**
 * Pruebas e2e del módulo de mantenimientos contra MySQL
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
import { APLICA_EN_TODOS, limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

describe('Mantenimientos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let activoDeBajaId: number;
  let planPreventivoId: number;
  let planCorrectivoId: number;
  let planDeBajaId: number;

  const MANANA = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const AYER = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Intervalo previsto que contiene "ahora": el trabajo se puede iniciar en plazo.
  const HACE_DOS_HORAS = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const HACE_UNA_HORA = new Date(Date.now() - 3600 * 1000).toISOString();
  const EN_UNA_SEMANA = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  // Fecha REAL de mantenimiento (obligatoria, la indica el usuario) dentro del plazo.
  const INICIO_REAL = { fechaInicio: HACE_UNA_HORA };
  const ahora = () => new Date().toISOString();

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
      data: { ...APLICA_EN_TODOS, nombre: 'Hardware', descripcion: '', claseMantenimiento: 'HARDWARE' },
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
    // Toda ejecución nace de una planificación (capa 1).
    const plan = {
      frecuencia: 'UNICA' as const,
      fechaInicio: new Date(HACE_DOS_HORAS),
      responsable: 'Infraestructura',
      actividades: 'Limpieza y actualización de firmware',
    };
    planPreventivoId = (await prisma.planMantenimiento.create({ data: { ...plan, activoId, tipo: 'PREVENTIVO' } })).id;
    planCorrectivoId = (
      await prisma.planMantenimiento.create({
        data: { ...plan, activoId, tipo: 'CORRECTIVO', actividades: 'Cambio de disco' },
      })
    ).id;
    planDeBajaId = (
      await prisma.planMantenimiento.create({ data: { ...plan, activoId: activoDeBajaId, tipo: 'PREVENTIVO' } })
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
      patch: (url: string, body: object = {}) =>
        auth(request(server).patch(url).send(body)),
    };
  };

  const programar = async (extra: Record<string, unknown> = {}) =>
    (
      await api(tokens.analista)
        .post('/api/mantenimientos', {
          planId: planPreventivoId,
          fecha: HACE_DOS_HORAS,
          fechaLimite: EN_UNA_SEMANA,
          ...extra,
        })
        .expect(201)
    ).body as { id: number };

  const FINALIZAR_OK = {
    resultado: 'Firmware actualizado; sin incidencias.',
    estadoEquipo: 'OPERATIVO',
    tecnico: 'jperez',
    diagnostico: 'Firmware desactualizado.',
    duracionMin: 45,
  };

  describe('ciclo completo: programar → iniciar → finalizar', () => {
    let id: number;

    it('programar desde la planificación → 201 Pendiente, con activo, tipo y descripción de la planificación', async () => {
      const res = await api(tokens.analista)
        .post('/api/mantenimientos', {
          planId: planPreventivoId,
          activoId,
          // Intervalo previsto que contiene "ahora": se inicia en plazo.
          fecha: HACE_DOS_HORAS,
          fechaLimite: EN_UNA_SEMANA,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        planId: planPreventivoId,
        plan: { id: planPreventivoId, frecuencia: 'UNICA', responsable: 'Infraestructura' },
        activo: { id: activoId, codigo: 'SRV-ERP' },
        tipo: 'PREVENTIVO',
        fase: 'PROGRAMADO',
        vencido: false,
        actividad: 'Limpieza y actualización de firmware',
        fecha: HACE_DOS_HORAS,
        fechaLimite: EN_UNA_SEMANA,
        fueraDePlazo: false,
        fechaInicio: null,
        fechaFin: null,
        estadoEquipo: null,
        resultado: null,
      });
      id = res.body.id;
    });

    it('no se puede finalizar sin haber iniciado → 409', () =>
      api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, { ...FINALIZAR_OK, fechaFin: ahora() })
        .expect(409));

    it('iniciar sin fecha real → 400 (no se usa la hora del servidor)', async () => {
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(400);
    });

    it('iniciar con la fecha real indicada → EN_EJECUCION, con esa fecha', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(200);
      expect(res.body.fase).toBe('EN_EJECUCION');
      expect(res.body.fechaInicio).toBe(HACE_UNA_HORA);
    });

    it('no se puede iniciar dos veces → 409', () =>
      api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(409));

    it('finalizar con fecha anterior al inicio → 400', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          ...FINALIZAR_OK,
          fechaFin: '2020-01-01T00:00:00.000Z',
        })
        .expect(400);
      expect(res.body.message).toMatch(/anterior a la fecha real de mantenimiento/);
    });

    it('finalizar sin fecha real de fin → 400', () =>
      api(tokens.analista).patch(`/api/mantenimientos/${id}/finalizar`, FINALIZAR_OK).expect(400));

    it('finalizar → FINALIZADO con resultado, estado del equipo, verificable y repositorio', async () => {
      const fechaFin = ahora();
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          ...FINALIZAR_OK,
          fechaFin,
          evidencia: 'Informe MT-2026-001',
          repositorioVerificable: 'https://intranet.example/mantenimiento/MT-2026-001.pdf',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        fase: 'FINALIZADO',
        estadoEquipo: 'OPERATIVO',
        resultado: FINALIZAR_OK.resultado,
        fechaFin,
        evidencia: 'Informe MT-2026-001',
        repositorioVerificable: 'https://intranet.example/mantenimiento/MT-2026-001.pdf',
      });
    });

    it('un mantenimiento finalizado ya no se puede cancelar → 409', () =>
      api(tokens.admin)
        .patch(`/api/mantenimientos/${id}/cancelar`, { motivo: 'X' })
        .expect(409));
  });

  describe('cancelación', () => {
    it('desde PROGRAMADO → CANCELADO, guarda el motivo como resultado', async () => {
      const { id } = await programar({ planId: planCorrectivoId });
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {
          motivo: 'El proveedor reprogramó la visita.',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        fase: 'CANCELADO',
        resultado: 'El proveedor reprogramó la visita.',
        estadoEquipo: null,
        // La cancelación tiene su propia fecha: la fecha real de fin queda vacía.
        fechaFin: null,
        fechaCancelacion: expect.any(String),
      });
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(409);
    });

    it('desde EN_EJECUCION → CANCELADO', async () => {
      const { id } = await programar();
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {
          motivo: 'Falta repuesto',
        })
        .expect(200);
      expect(res.body.fase).toBe('CANCELADO');
    });

    it('cancelar sin motivo → 400', async () => {
      const { id } = await programar();
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {})
        .expect(400);
    });
  });

  describe('validaciones', () => {
    it('sin planificación, planificación inexistente, de otro activo o con activo dado de baja → 400', async () => {
      const cuerpo = { fecha: MANANA, fechaLimite: EN_UNA_SEMANA };
      await api(tokens.analista).post('/api/mantenimientos', { ...cuerpo, activoId }).expect(400);
      await api(tokens.analista).post('/api/mantenimientos', { ...cuerpo, planId: 999999 }).expect(400);
      const otro = await api(tokens.analista)
        .post('/api/mantenimientos', { ...cuerpo, planId: planPreventivoId, activoId: activoDeBajaId })
        .expect(400);
      expect(otro.body.message).toMatch(/no es el de la planificación/);
      const res = await api(tokens.analista)
        .post('/api/mantenimientos', { ...cuerpo, planId: planDeBajaId })
        .expect(400);
      expect(res.body.message).toMatch(/dado de baja/);
    });

    it('tipo, actividad o campos de otras fases al programar → 400 (salen de la planificación)', async () => {
      const cuerpo = { planId: planPreventivoId, fecha: MANANA, fechaLimite: EN_UNA_SEMANA };
      await api(tokens.analista).post('/api/mantenimientos', { ...cuerpo, tipo: 'CORRECTIVO' }).expect(400);
      await api(tokens.analista).post('/api/mantenimientos', { ...cuerpo, actividad: 'Otra' }).expect(400);
      await api(tokens.analista).post('/api/mantenimientos', { ...cuerpo, fase: 'FINALIZADO' }).expect(400);
    });

    it('finalizar sin estado del equipo o con estado inválido → 400', async () => {
      const { id } = await programar();
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(200);
      const url = `/api/mantenimientos/${id}/finalizar`;
      await api(tokens.analista).patch(url, { resultado: 'OK', fechaFin: ahora() }).expect(400);
      await api(tokens.analista)
        .patch(url, { resultado: 'OK', estadoEquipo: 'ROTO', fechaFin: ahora() })
        .expect(400);
      // Repositorio con un esquema que no es http(s) → 400.
      const repo = await api(tokens.analista)
        .patch(url, { ...FINALIZAR_OK, fechaFin: ahora(), repositorioVerificable: 'javascript:alert(1)' })
        .expect(400);
      expect(repo.body.message).toMatch(/http o https/);
    });

    it('fechaInicio futura → 400', async () => {
      const { id } = await programar();
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: MANANA })
        .expect(400);
      expect(res.body.message).toContain(
        'fechaInicio no puede estar en el futuro',
      );
    });

    it('inexistente → 404; id no numérico → 400', async () => {
      await api(tokens.auditor).get('/api/mantenimientos/999999').expect(404);
      await api(tokens.analista)
        .patch('/api/mantenimientos/999999/iniciar', INICIO_REAL)
        .expect(404);
      await api(tokens.auditor).get('/api/mantenimientos/abc').expect(400);
    });
  });

  describe('permisos por rol', () => {
    it('el auditor puede consultar pero no programar ni cambiar de fase → 403', async () => {
      const { id } = await programar();
      await api(tokens.auditor).get(`/api/mantenimientos/${id}`).expect(200);
      await api(tokens.auditor)
        .post('/api/mantenimientos', { planId: planPreventivoId, fecha: MANANA, fechaLimite: EN_UNA_SEMANA })
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/mantenimientos/${id}/cancelar`, { motivo: 'X' })
        .expect(403);
    });
  });

  describe('consulta (GET /api/mantenimientos)', () => {
    let vencidoId: number;

    beforeAll(async () => {
      vencidoId = (await programar({ fecha: AYER, fechaLimite: HACE_UNA_HORA })).id;
    });

    it('marca como vencido un PROGRAMADO con fecha pasada, y lo filtra', async () => {
      const detalle = await api(tokens.auditor)
        .get(`/api/mantenimientos/${vencidoId}`)
        .expect(200);
      expect(detalle.body.vencido).toBe(true);

      const vencidos = await api(tokens.auditor)
        .get('/api/mantenimientos?vencidos=true')
        .expect(200);
      expect(vencidos.body.data.map((m: { id: number }) => m.id)).toEqual([
        vencidoId,
      ]);

      const noVencidos = await api(tokens.auditor)
        .get('/api/mantenimientos?vencidos=false&limit=100')
        .expect(200);
      expect(
        noVencidos.body.data.map((m: { id: number }) => m.id),
      ).not.toContain(vencidoId);
    });

    it('filtros por tipo y fase', async () => {
      const correctivos = await api(tokens.auditor)
        .get('/api/mantenimientos?tipo=CORRECTIVO')
        .expect(200);
      expect(
        correctivos.body.data.every(
          (m: { tipo: string }) => m.tipo === 'CORRECTIVO',
        ),
      ).toBe(true);
      expect(correctivos.body.meta.total).toBe(1);

      const finalizados = await api(tokens.auditor)
        .get('/api/mantenimientos?fase=FINALIZADO')
        .expect(200);
      expect(finalizados.body.meta.total).toBe(1);
    });

    it('rango de fechas (calendario) y orden ascendente', async () => {
      const desde = encodeURIComponent(
        new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      );
      // Hasta hace 3 h: deja fuera los programados hace 2 h.
      const hasta = encodeURIComponent(new Date(Date.now() - 3 * 3600 * 1000).toISOString());
      const res = await api(tokens.auditor)
        .get(`/api/mantenimientos?desde=${desde}&hasta=${hasta}&order=asc`)
        .expect(200);
      expect(res.body.data.map((m: { id: number }) => m.id)).toEqual([
        vencidoId,
      ]);
    });

    it('?actualizadoDesde devuelve solo lo modificado después de esa fecha', async () => {
      const { id } = await programar();
      const desde = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`, INICIO_REAL)
        .expect(200);
      const res = await api(tokens.auditor)
        .get(
          `/api/mantenimientos?actualizadoDesde=${encodeURIComponent(desde)}`,
        )
        .expect(200);
      expect(res.body.data.map((m: { id: number }) => m.id)).toEqual([id]);
    });

    it('filtros inválidos → 400', async () => {
      await api(tokens.auditor)
        .get('/api/mantenimientos?fase=ABIERTO')
        .expect(400);
      await api(tokens.auditor)
        .get('/api/mantenimientos?vencidos=quizas')
        .expect(400);
    });
  });

  it('Swagger documenta las rutas de mantenimientos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/mantenimientos',
        '/api/mantenimientos/{id}',
        '/api/mantenimientos/{id}/iniciar',
        '/api/mantenimientos/{id}/finalizar',
        '/api/mantenimientos/{id}/cancelar',
        '/api/mantenimientos/{id}/ejecucion',
        '/api/mantenimientos/bitacora/general',
        '/api/mantenimientos/bitacora/especifica',
      ]),
    );
  });
});
