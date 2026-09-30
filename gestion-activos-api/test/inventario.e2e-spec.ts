/**
 * Pruebas e2e del inventario contra MySQL (base gestion_activos_test) y el
 * Keycloak de desarrollo. La base se vacía al inicio de este archivo.
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

describe('Inventario (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
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
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };

  // -------------------------------------------------------------------------
  describe('Catálogos', () => {
    let categoriaId: number;

    it('admin crea una categoría (y se recortan los espacios) → 201', async () => {
      const res = await api(tokens.admin)
        .post('/api/categorias', {
          nombre: '  Hardware  ',
          descripcion: 'Equipos físicos',
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        nombre: 'Hardware',
        descripcion: 'Equipos físicos',
      });
      categoriaId = res.body.id;
    });

    it('analista y auditor NO pueden crear catálogos → 403', async () => {
      await api(tokens.analista)
        .post('/api/categorias', { nombre: 'X', descripcion: '' })
        .expect(403);
      await api(tokens.auditor)
        .post('/api/criticidades', { nivel: 'X' })
        .expect(403);
    });

    it('nombre de categoría duplicado → 409', async () => {
      const res = await api(tokens.admin)
        .post('/api/categorias', { nombre: 'Hardware', descripcion: 'otra' })
        .expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    });

    it('todos los roles pueden listar catálogos (para los selectores)', async () => {
      const res = await api(tokens.auditor).get('/api/categorias').expect(200);
      expect(res.body.map((c: { nombre: string }) => c.nombre)).toContain(
        'Hardware',
      );
    });

    it('admin modifica una categoría → 200', async () => {
      const res = await api(tokens.admin)
        .patch(`/api/categorias/${categoriaId}`, {
          descripcion: 'Servidores y estaciones',
        })
        .expect(200);
      expect(res.body.descripcion).toBe('Servidores y estaciones');
    });

    it('criticidades: alta, duplicado → 409, listado', async () => {
      await api(tokens.admin)
        .post('/api/criticidades', { nivel: 'Alta' })
        .expect(201);
      await api(tokens.admin)
        .post('/api/criticidades', { nivel: 'Alta' })
        .expect(409);
      const res = await api(tokens.analista)
        .get('/api/criticidades')
        .expect(200);
      expect(res.body).toEqual([{ id: expect.any(Number), nivel: 'Alta' }]);
    });

    it('eliminar categoría: libre → 204, inexistente → 404', async () => {
      const libre = await api(tokens.admin)
        .post('/api/categorias', { nombre: 'Temporal', descripcion: '' })
        .expect(201);
      await api(tokens.admin)
        .delete(`/api/categorias/${libre.body.id}`)
        .expect(204);
      await api(tokens.admin)
        .delete(`/api/categorias/${libre.body.id}`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('Activos', () => {
    let hardware: number;
    let software: number;
    let alta: number;
    let baja: number;

    const nuevoActivo = (extra: Record<string, unknown> = {}) => ({
      codigo: 'SRV-001',
      nombre: 'Servidor de base de datos',
      sistemas: 'ERP',
      custodio: 'Infraestructura',
      ubicacion: 'Rack 3',
      cifrado: true,
      ultimaRevision: '2026-09-15T00:00:00.000Z',
      categoriaId: hardware,
      criticidadId: alta,
      ...extra,
    });

    beforeAll(async () => {
      await limpiarBaseDeDatos(prisma);
      hardware = (
        await prisma.categoria.create({
          data: { nombre: 'Hardware', descripcion: '' },
        })
      ).id;
      software = (
        await prisma.categoria.create({
          data: { nombre: 'Software', descripcion: '' },
        })
      ).id;
      alta = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
      baja = (await prisma.criticidad.create({ data: { nivel: 'Baja' } })).id;
    });

    describe('alta (POST)', () => {
      let id: number;

      it('analista registra un activo → 201 con categoría y criticidad incluidas', async () => {
        const res = await api(tokens.analista)
          .post('/api/activos', nuevoActivo())
          .expect(201);
        expect(res.body).toMatchObject({
          codigo: 'SRV-001',
          cifrado: true,
          ultimaRevision: '2026-09-15T00:00:00.000Z',
          categoria: { id: hardware, nombre: 'Hardware' },
          criticidad: { id: alta, nivel: 'Alta' },
          deletedAt: null,
        });
        id = res.body.id;
      });

      it('el alta queda en la bitácora con el usuario del TOKEN como responsable', async () => {
        const res = await api(tokens.auditor)
          .get(`/api/activos/${id}/bitacora`)
          .expect(200);
        expect(res.body.meta.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
          accion: 'CREAR',
          responsable: 'analista.test',
          detalle: { codigo: { antes: null, despues: 'SRV-001' } },
        });
      });

      it('auditor NO puede registrar activos → 403', () =>
        api(tokens.auditor)
          .post('/api/activos', nuevoActivo({ codigo: 'X-1' }))
          .expect(403));

      it('código duplicado → 409', () =>
        api(tokens.analista).post('/api/activos', nuevoActivo()).expect(409));

      it('categoría inexistente → 400 con mensaje claro', async () => {
        const res = await api(tokens.analista)
          .post(
            '/api/activos',
            nuevoActivo({ codigo: 'X-2', categoriaId: 999999 }),
          )
          .expect(400);
        expect(res.body.message).toBe('La categoría 999999 no existe.');
      });

      it('campos faltantes, tipos incorrectos o campos extra → 400', async () => {
        await api(tokens.analista)
          .post('/api/activos', { codigo: 'X-3' })
          .expect(400);
        await api(tokens.analista)
          .post('/api/activos', nuevoActivo({ codigo: 'X-4', cifrado: 'si' }))
          .expect(400);
        await api(tokens.analista)
          .post('/api/activos', nuevoActivo({ codigo: 'X-5', deletedAt: null }))
          .expect(400);
      });
    });

    describe('consulta (GET)', () => {
      beforeAll(async () => {
        const crear = (extra: Record<string, unknown>) =>
          api(tokens.admin)
            .post('/api/activos', nuevoActivo(extra))
            .expect(201);
        await crear({
          codigo: 'APP-001',
          nombre: 'Portal web',
          categoriaId: software,
          criticidadId: baja,
          cifrado: false,
        });
        await crear({
          codigo: 'APP-002',
          nombre: 'Correo',
          categoriaId: software,
          cifrado: false,
        });
      });

      it('lista paginada con meta', async () => {
        const res = await api(tokens.auditor)
          .get('/api/activos?limit=2&page=1')
          .expect(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.meta).toEqual({
          total: 3,
          page: 1,
          limit: 2,
          totalPages: 2,
        });
        // Orden por defecto: código ascendente.
        expect(res.body.data.map((a: { codigo: string }) => a.codigo)).toEqual([
          'APP-001',
          'APP-002',
        ]);
      });

      it('filtros: búsqueda de texto, categoría y cifrado', async () => {
        const porTexto = await api(tokens.auditor)
          .get('/api/activos?q=PORTAL')
          .expect(200);
        expect(
          porTexto.body.data.map((a: { codigo: string }) => a.codigo),
        ).toEqual(['APP-001']);

        const porCategoria = await api(tokens.auditor)
          .get(`/api/activos?categoriaId=${software}`)
          .expect(200);
        expect(porCategoria.body.meta.total).toBe(2);

        const sinCifrar = await api(tokens.auditor)
          .get(`/api/activos?cifrado=false&criticidadId=${alta}`)
          .expect(200);
        expect(
          sinCifrar.body.data.map((a: { codigo: string }) => a.codigo),
        ).toEqual(['APP-002']);
      });

      it('orden configurable', async () => {
        const res = await api(tokens.auditor)
          .get('/api/activos?sort=nombre&order=desc')
          .expect(200);
        expect(res.body.data.map((a: { nombre: string }) => a.nombre)).toEqual([
          'Servidor de base de datos',
          'Portal web',
          'Correo',
        ]);
      });

      it('parámetros de consulta inválidos → 400', async () => {
        await api(tokens.auditor).get('/api/activos?limit=500').expect(400);
        await api(tokens.auditor).get('/api/activos?sort=clave').expect(400);
      });

      it('detalle: existente → 200, inexistente → 404, id no numérico → 400', async () => {
        const lista = await api(tokens.auditor)
          .get('/api/activos?q=SRV-001')
          .expect(200);
        await api(tokens.auditor)
          .get(`/api/activos/${lista.body.data[0].id}`)
          .expect(200);
        await api(tokens.auditor).get('/api/activos/999999').expect(404);
        await api(tokens.auditor).get('/api/activos/abc').expect(400);
      });
    });

    describe('modificación (PATCH) y sincronización incremental', () => {
      let id: number;

      beforeAll(async () => {
        const lista = await api(tokens.auditor)
          .get('/api/activos?q=SRV-001')
          .expect(200);
        id = lista.body.data[0].id;
      });

      it('modifica solo lo enviado y registra antes/después en la bitácora', async () => {
        const res = await api(tokens.analista)
          .patch(`/api/activos/${id}`, {
            ubicacion: 'Rack 7',
            nombre: 'Servidor de base de datos',
          })
          .expect(200);
        expect(res.body).toMatchObject({
          ubicacion: 'Rack 7',
          codigo: 'SRV-001',
        });

        const bitacora = await api(tokens.auditor)
          .get(`/api/activos/${id}/bitacora`)
          .expect(200);
        expect(bitacora.body.data[0]).toMatchObject({
          accion: 'ACTUALIZAR',
          responsable: 'analista.test',
          // "nombre" no cambió: no aparece en el detalle.
          detalle: { ubicacion: { antes: 'Rack 3', despues: 'Rack 7' } },
        });
      });

      it('un PATCH sin cambios reales no toca updatedAt ni la bitácora', async () => {
        const antes = await api(tokens.auditor)
          .get(`/api/activos/${id}`)
          .expect(200);
        await api(tokens.analista)
          .patch(`/api/activos/${id}`, { ubicacion: 'Rack 7' })
          .expect(200);
        const despues = await api(tokens.auditor)
          .get(`/api/activos/${id}`)
          .expect(200);
        expect(despues.body.updatedAt).toBe(antes.body.updatedAt);

        const bitacora = await api(tokens.auditor)
          .get(`/api/activos/${id}/bitacora`)
          .expect(200);
        expect(bitacora.body.meta.total).toBe(2); // CREAR + ACTUALIZAR
      });

      it('?actualizadoDesde devuelve solo lo modificado después de esa fecha', async () => {
        const desde = new Date().toISOString();
        await new Promise((r) => setTimeout(r, 20));
        await api(tokens.analista)
          .patch(`/api/activos/${id}`, { custodio: 'Seguridad TI' })
          .expect(200);

        const res = await api(tokens.auditor)
          .get(`/api/activos?actualizadoDesde=${encodeURIComponent(desde)}`)
          .expect(200);
        expect(res.body.data.map((a: { codigo: string }) => a.codigo)).toEqual([
          'SRV-001',
        ]);
      });

      it('código duplicado al modificar → 409', () =>
        api(tokens.analista)
          .patch(`/api/activos/${id}`, { codigo: 'APP-001' })
          .expect(409));
    });

    describe('baja lógica (DELETE)', () => {
      let id: number;
      let desde: string;

      beforeAll(async () => {
        const res = await api(tokens.admin)
          .post(
            '/api/activos',
            nuevoActivo({ codigo: 'OLD-001', nombre: 'Equipo obsoleto' }),
          )
          .expect(201);
        id = res.body.id;
        desde = new Date().toISOString();
        await new Promise((r) => setTimeout(r, 20));
      });

      it('analista NO puede dar de baja → 403', () =>
        api(tokens.analista).delete(`/api/activos/${id}`).expect(403));

      it('admin da de baja → 204', () =>
        api(tokens.admin).delete(`/api/activos/${id}`).expect(204));

      it('el activo dado de baja ya no se consulta ni se lista', async () => {
        await api(tokens.auditor).get(`/api/activos/${id}`).expect(404);
        const lista = await api(tokens.auditor)
          .get('/api/activos?q=OLD-001')
          .expect(200);
        expect(lista.body.meta.total).toBe(0);
      });

      it('pero sigue en la base: visible con incluirBajas y en la sincronización', async () => {
        const conBajas = await api(tokens.auditor)
          .get('/api/activos?q=OLD-001&incluirBajas=true')
          .expect(200);
        expect(conBajas.body.data[0].deletedAt).not.toBeNull();

        const sync = await api(tokens.auditor)
          .get(`/api/activos?actualizadoDesde=${encodeURIComponent(desde)}`)
          .expect(200);
        expect(sync.body.data).toEqual([
          expect.objectContaining({
            codigo: 'OLD-001',
            deletedAt: expect.any(String),
          }),
        ]);
      });

      it('su historial se conserva y registra quién lo dio de baja', async () => {
        const res = await api(tokens.auditor)
          .get(`/api/activos/${id}/bitacora`)
          .expect(200);
        expect(res.body.data.map((b: { accion: string }) => b.accion)).toEqual([
          'DAR_DE_BAJA',
          'CREAR',
        ]);
        expect(res.body.data[0].responsable).toBe('admin.test');
      });

      it('no se puede modificar ni dar de baja otra vez → 404', async () => {
        await api(tokens.admin)
          .patch(`/api/activos/${id}`, { nombre: 'X' })
          .expect(404);
        await api(tokens.admin).delete(`/api/activos/${id}`).expect(404);
      });

      it('una categoría con activos (aunque estén de baja) no se puede eliminar → 409', async () => {
        const res = await api(tokens.admin)
          .delete(`/api/categorias/${hardware}`)
          .expect(409);
        expect(res.body.message).toMatch(/asignada a \d+ activo/);
      });
    });
  });
});
