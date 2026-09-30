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
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

describe('Mantenimientos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let activoDeBajaId: number;

  const MANANA = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const AYER = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

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
      patch: (url: string, body: object = {}) =>
        auth(request(server).patch(url).send(body)),
    };
  };

  const programar = async (extra: Record<string, unknown> = {}) =>
    (
      await api(tokens.analista)
        .post('/api/mantenimientos', {
          activoId,
          tipo: 'PREVENTIVO',
          actividad: 'Limpieza y actualización de firmware',
          fecha: MANANA,
          ...extra,
        })
        .expect(201)
    ).body as { id: number };

  const FINALIZAR_OK = {
    resultado: 'Firmware actualizado; sin incidencias.',
    estadoEquipo: 'OPERATIVO',
  };

  describe('ciclo completo: programar → iniciar → finalizar', () => {
    let id: number;

    it('programar → 201 en fase PROGRAMADO, con el activo incluido', async () => {
      const res = await api(tokens.analista)
        .post('/api/mantenimientos', {
          activoId,
          tipo: 'PREVENTIVO',
          actividad: '  Limpieza y actualización de firmware  ',
          fecha: MANANA,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        activo: { id: activoId, codigo: 'SRV-ERP' },
        tipo: 'PREVENTIVO',
        fase: 'PROGRAMADO',
        vencido: false,
        actividad: 'Limpieza y actualización de firmware',
        fecha: MANANA,
        fechaInicio: null,
        fechaFin: null,
        estadoEquipo: null,
        resultado: null,
      });
      id = res.body.id;
    });

    it('no se puede finalizar sin haber iniciado → 409', () =>
      api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, FINALIZAR_OK)
        .expect(409));

    it('iniciar sin body usa la hora del servidor → EN_EJECUCION', async () => {
      const antes = Date.now();
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(200);
      expect(res.body.fase).toBe('EN_EJECUCION');
      expect(new Date(res.body.fechaInicio).getTime()).toBeGreaterThanOrEqual(
        antes - 1000,
      );
    });

    it('no se puede iniciar dos veces → 409', () =>
      api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(409));

    it('finalizar con fecha anterior al inicio → 400', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          ...FINALIZAR_OK,
          fechaFin: '2020-01-01T00:00:00.000Z',
        })
        .expect(400);
      expect(res.body.message).toMatch(/anterior a la de inicio/);
    });

    it('finalizar → FINALIZADO con resultado y estado del equipo', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, FINALIZAR_OK)
        .expect(200);
      expect(res.body).toMatchObject({
        fase: 'FINALIZADO',
        estadoEquipo: 'OPERATIVO',
        resultado: FINALIZAR_OK.resultado,
        fechaFin: expect.any(String),
      });
    });

    it('un mantenimiento finalizado ya no se puede cancelar → 409', () =>
      api(tokens.admin)
        .patch(`/api/mantenimientos/${id}/cancelar`, { motivo: 'X' })
        .expect(409));
  });

  describe('cancelación', () => {
    it('desde PROGRAMADO → CANCELADO, guarda el motivo como resultado', async () => {
      const { id } = await programar({
        tipo: 'CORRECTIVO',
        actividad: 'Cambio de disco',
      });
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {
          motivo: 'El proveedor reprogramó la visita.',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        fase: 'CANCELADO',
        resultado: 'El proveedor reprogramó la visita.',
        estadoEquipo: null,
        fechaFin: expect.any(String),
      });
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(409);
    });

    it('desde EN_EJECUCION → CANCELADO', async () => {
      const { id } = await programar({ actividad: 'Revisión de UPS' });
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {
          motivo: 'Falta repuesto',
        })
        .expect(200);
      expect(res.body.fase).toBe('CANCELADO');
    });

    it('cancelar sin motivo → 400', async () => {
      const { id } = await programar({ actividad: 'Sin motivo' });
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/cancelar`, {})
        .expect(400);
    });
  });

  describe('validaciones', () => {
    it('activo inexistente o dado de baja → 400', async () => {
      const cuerpo = { tipo: 'PREVENTIVO', actividad: 'X', fecha: MANANA };
      await api(tokens.analista)
        .post('/api/mantenimientos', { ...cuerpo, activoId: 999999 })
        .expect(400);
      const res = await api(tokens.analista)
        .post('/api/mantenimientos', { ...cuerpo, activoId: activoDeBajaId })
        .expect(400);
      expect(res.body.message).toMatch(/dado de baja/);
    });

    it('tipo inválido o campos de otras fases al programar → 400', async () => {
      const cuerpo = { activoId, actividad: 'X', fecha: MANANA };
      await api(tokens.analista)
        .post('/api/mantenimientos', { ...cuerpo, tipo: 'PREDICTIVO' })
        .expect(400);
      await api(tokens.analista)
        .post('/api/mantenimientos', {
          ...cuerpo,
          tipo: 'PREVENTIVO',
          fase: 'FINALIZADO',
        })
        .expect(400);
    });

    it('finalizar sin estado del equipo o con estado inválido → 400', async () => {
      const { id } = await programar({ actividad: 'Validación de cierre' });
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(200);
      const url = `/api/mantenimientos/${id}/finalizar`;
      await api(tokens.analista).patch(url, { resultado: 'OK' }).expect(400);
      await api(tokens.analista)
        .patch(url, { resultado: 'OK', estadoEquipo: 'ROTO' })
        .expect(400);
    });

    it('fechaInicio futura → 400', async () => {
      const { id } = await programar({ actividad: 'Inicio futuro' });
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
        .patch('/api/mantenimientos/999999/iniciar')
        .expect(404);
      await api(tokens.auditor).get('/api/mantenimientos/abc').expect(400);
    });
  });

  describe('permisos por rol', () => {
    it('el auditor puede consultar pero no programar ni cambiar de fase → 403', async () => {
      const { id } = await programar({ actividad: 'Permisos' });
      await api(tokens.auditor).get(`/api/mantenimientos/${id}`).expect(200);
      await api(tokens.auditor)
        .post('/api/mantenimientos', {
          activoId,
          tipo: 'PREVENTIVO',
          actividad: 'X',
          fecha: MANANA,
        })
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/mantenimientos/${id}/iniciar`)
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/mantenimientos/${id}/cancelar`, { motivo: 'X' })
        .expect(403);
    });
  });

  describe('consulta (GET /api/mantenimientos)', () => {
    let vencidoId: number;

    beforeAll(async () => {
      vencidoId = (await programar({ actividad: 'Atrasado', fecha: AYER })).id;
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
      const hasta = encodeURIComponent(new Date().toISOString());
      const res = await api(tokens.auditor)
        .get(`/api/mantenimientos?desde=${desde}&hasta=${hasta}&order=asc`)
        .expect(200);
      expect(res.body.data.map((m: { id: number }) => m.id)).toEqual([
        vencidoId,
      ]);
    });

    it('?actualizadoDesde devuelve solo lo modificado después de esa fecha', async () => {
      const { id } = await programar({ actividad: 'Sincronización' });
      const desde = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/iniciar`)
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
      ]),
    );
  });
});
