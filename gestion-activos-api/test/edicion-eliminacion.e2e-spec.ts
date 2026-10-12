/**
 * Pruebas e2e de EDITAR y ELIMINAR en respaldos, mantenimientos y
 * vulnerabilidades, y de la integridad entre estos registros y los activos.
 * Contra MySQL (base gestion_activos_test) y el Keycloak de desarrollo.
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

const LENTO = 120_000;
const MANANA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const HACE_UNA_HORA = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('Editar y eliminar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let datosActivo: object;

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
    const criticidad = await prisma.criticidad.create({ data: { nivel: 'Alta' } });
    datosActivo = {
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
      await prisma.activo.create({
        data: { ...datosActivo, codigo: 'SRV-ERP' } as never,
      })
    ).id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const api = (token: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };
  const crear = async (url: string, body: object) =>
    (await api(tokens.analista).post(url, body).expect(201)).body as { id: number };

  describe('respaldos', () => {
    const nuevo = () =>
      crear('/api/respaldos', { activoId, alcanceDetalle: 'Base de datos ERP' });

    it('editar el alcance mientras la ejecución está pendiente → 200', async () => {
      const { id } = await nuevo();
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}`, { alcanceDetalle: '  BD ERP + configuración  ' })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        alcanceDetalle: 'BD ERP + configuración',
        etapa: 'PENDIENTE_EJECUCION',
        activo: { id: activoId, codigo: 'SRV-ERP' },
      });
    });

    it('con la ejecución ya registrada el alcance no se edita → 409', async () => {
      const { id } = await nuevo();
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}/ejecucion`, {
          estadoEjecucion: 'EXITOSA',
          fechaEjecucion: HACE_UNA_HORA,
          rutaEvidencia: '\\\\nas01\\respaldos\\erp.log',
        })
        .expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/${id}`, { alcanceDetalle: 'Otro alcance' })
        .expect(409);
      expect(res.body.message).toContain('no se puede modificar');
    });

    it('validaciones: alcance vacío o campos de otras capas → 400; inexistente → 404', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/respaldos/${id}`, { alcanceDetalle: '  ' }).expect(400);
      await api(tokens.analista)
        .patch(`/api/respaldos/${id}`, { alcanceDetalle: 'ok', estadoEjecucion: 'EXITOSA' })
        .expect(400);
      await api(tokens.analista).patch('/api/respaldos/999999', { alcanceDetalle: 'x' }).expect(404);
    });

    it('eliminar: solo el admin → 204; después ya no existe ni se lista', async () => {
      const { id } = await nuevo();
      await api(tokens.auditor).delete(`/api/respaldos/${id}`).expect(403);
      await api(tokens.analista).delete(`/api/respaldos/${id}`).expect(403);
      await api(tokens.admin).delete(`/api/respaldos/${id}`).expect(204);
      await api(tokens.admin).get(`/api/respaldos/${id}`).expect(404);
      await api(tokens.admin).delete(`/api/respaldos/${id}`).expect(404);
      const lista = await api(tokens.auditor).get('/api/respaldos').expect(200);
      expect(lista.body.data.map((r: { id: number }) => r.id)).not.toContain(id);
    });

    it('el auditor no puede editar → 403', async () => {
      const { id } = await nuevo();
      await api(tokens.auditor).patch(`/api/respaldos/${id}`, { alcanceDetalle: 'x' }).expect(403);
    });
  });

  describe('mantenimientos', () => {
    const nuevo = () =>
      crear('/api/mantenimientos', {
        activoId,
        tipo: 'PREVENTIVO',
        actividad: 'Limpieza',
        fecha: MANANA,
      });

    it('editar tipo, actividad y fecha mientras está PROGRAMADO → 200', async () => {
      const { id } = await nuevo();
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { tipo: 'CORRECTIVO', actividad: 'Cambio de disco' })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        tipo: 'CORRECTIVO',
        actividad: 'Cambio de disco',
        fase: 'PROGRAMADO',
        fecha: MANANA, // lo no enviado no cambia
      });
    });

    it('no se puede cambiar de activo ni tocar campos de otras fases → 400', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { activoId: 999 }).expect(400);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { fase: 'FINALIZADO' }).expect(400);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { tipo: 'OTRO' }).expect(400);
    });

    it('una vez iniciado ya no se edita → 409', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { actividad: 'Otra' })
        .expect(409);
      expect(res.body.message).toContain('EN_EJECUCION');
    });

    it('eliminar: solo el admin, en cualquier fase → 204', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(200);
      await api(tokens.analista).delete(`/api/mantenimientos/${id}`).expect(403);
      await api(tokens.admin).delete(`/api/mantenimientos/${id}`).expect(204);
      await api(tokens.admin).get(`/api/mantenimientos/${id}`).expect(404);
    });
  });

  describe('vulnerabilidades', () => {
    const nueva = (extra: object = {}) =>
      crear('/api/vulnerabilidades', {
        activoId,
        descripcion: 'OpenSSL vulnerable',
        nivelRiesgo: 'ALTO',
        fecha: HACE_UNA_HORA,
        ...extra,
      });

    it('editar descripción, riesgo, CVE y plazo mientras está pendiente → 200', async () => {
      const { id } = await nueva();
      const res = await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}`, {
          nivelRiesgo: 'CRITICO',
          cve: 'cve-2026-11111',
          fechaLimite: MANANA,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        nivelRiesgo: 'CRITICO',
        cve: 'CVE-2026-11111',
        fechaLimite: MANANA,
        descripcion: 'OpenSSL vulnerable',
        estado: 'ABIERTA',
      });
    });

    it('fecha límite anterior a la detección → 400', async () => {
      const { id } = await nueva();
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { fechaLimite: ayer }).expect(400);
    });

    it('no puede quedar con el CVE de otra vulnerabilidad pendiente del mismo activo → 409', async () => {
      await nueva({ cve: 'CVE-2026-22222' });
      const { id } = await nueva();
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { cve: 'CVE-2026-22222' }).expect(409);
    });

    it('una vez cerrada ya no se edita → 409', async () => {
      const { id } = await nueva();
      await api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, { justificacion: 'Sistema aislado' })
        .expect(200);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { descripcion: 'Otra' }).expect(409);
    });

    it('eliminar: solo el admin → 204', async () => {
      const { id } = await nueva();
      await api(tokens.analista).delete(`/api/vulnerabilidades/${id}`).expect(403);
      await api(tokens.admin).delete(`/api/vulnerabilidades/${id}`).expect(204);
      await api(tokens.admin).get(`/api/vulnerabilidades/${id}`).expect(404);
    });
  });

  describe('integridad con los activos', () => {
    it('dar de baja un activo con registros asociados no da error ni los borra', async () => {
      const otro = await prisma.activo.create({
        data: { ...datosActivo, codigo: 'SRV-CON-HISTORIAL' } as never,
      });
      const respaldo = await crear('/api/respaldos', { activoId: otro.id, alcanceDetalle: 'Datos' });
      const mantenimiento = await crear('/api/mantenimientos', {
        activoId: otro.id,
        tipo: 'PREVENTIVO',
        actividad: 'Limpieza',
        fecha: MANANA,
      });

      await api(tokens.admin).delete(`/api/activos/${otro.id}`).expect(204);

      // El historial sigue consultable, con los datos del activo dado de baja.
      const r = await api(tokens.auditor).get(`/api/respaldos/${respaldo.id}`).expect(200);
      expect(r.body.activo).toMatchObject({ id: otro.id, codigo: 'SRV-CON-HISTORIAL' });
      await api(tokens.auditor).get(`/api/mantenimientos/${mantenimiento.id}`).expect(200);
      // Y ya no se pueden abrir registros nuevos sobre él.
      await api(tokens.analista)
        .post('/api/respaldos', { activoId: otro.id, alcanceDetalle: 'Otro' })
        .expect(400);
    });

    it('la base impide borrar físicamente un activo con registros (clave foránea)', async () => {
      await crear('/api/respaldos', { activoId, alcanceDetalle: 'Protegido' });
      await expect(prisma.activo.delete({ where: { id: activoId } })).rejects.toMatchObject({
        code: 'P2003',
      });
    });

    it('una categoría o criticidad en uso no se puede eliminar → 409', async () => {
      const activo = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
      await api(tokens.admin).delete(`/api/categorias/${activo.categoriaId}`).expect(409);
      await api(tokens.admin).delete(`/api/criticidades/${activo.criticidadId}`).expect(409);
    });

    it(
      'registros HUÉRFANOS (activos borrados saltándose las claves foráneas): los módulos siguen funcionando',
      async () => {
        // Se reproduce el incidente: un registro que apunta a un activo inexistente.
        // Las tres sentencias van en una transacción para compartir conexión.
        const insertar = (sql: string) =>
          prisma.$transaction([
            prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
            prisma.$executeRawUnsafe(sql),
            prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
          ]);
        await insertar(
          "INSERT INTO respaldo (activoId, alcanceDetalle, updatedAt) VALUES (987654, 'huérfano', NOW(3))",
        );
        await insertar(
          "INSERT INTO mantenimiento (activoId, tipo, actividad, fecha, updatedAt) VALUES (987654, 'PREVENTIVO', 'huérfano', NOW(3), NOW(3))",
        );
        const huerfano = await prisma.respaldo.findFirstOrThrow({ where: { activoId: 987654 } });
        try {
          // Antes esto devolvía 500 y dejaba la pantalla en blanco.
          const respaldos = await api(tokens.auditor).get('/api/respaldos').expect(200);
          const mantenimientos = await api(tokens.auditor).get('/api/mantenimientos').expect(200);
          await api(tokens.auditor).get('/api/vulnerabilidades').expect(200);

          // Los huérfanos no se muestran y el total cuadra con lo listado.
          expect(respaldos.body.data.every((r: { activoId: number }) => r.activoId !== 987654)).toBe(true);
          expect(respaldos.body.meta.total).toBe(
            await prisma.respaldo.count({ where: { activoId: { not: 987654 } } }),
          );
          expect(mantenimientos.body.data.every((m: { activoId: number }) => m.activoId !== 987654)).toBe(true);
          await api(tokens.auditor).get(`/api/respaldos/${huerfano.id}`).expect(404);
        } finally {
          await prisma.respaldo.deleteMany({ where: { activoId: 987654 } });
          await prisma.mantenimiento.deleteMany({ where: { activoId: 987654 } });
        }
      },
      LENTO,
    );

    it(
      'base con CERO activos: todos los listados responden vacíos, sin errores',
      async () => {
        await limpiarBaseDeDatos(prisma);
        for (const ruta of ['activos', 'respaldos', 'mantenimientos', 'vulnerabilidades', 'categorias', 'criticidades']) {
          const res = await api(tokens.auditor).get(`/api/${ruta}`).expect(200);
          expect(Array.isArray(res.body) ? res.body : res.body.data).toEqual([]);
        }
      },
      LENTO,
    );
  });

  it('Swagger documenta editar y eliminar en los tres módulos', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const ruta of ['respaldos', 'mantenimientos', 'vulnerabilidades']) {
      expect(Object.keys(res.body.paths[`/api/${ruta}/{id}`])).toEqual(
        expect.arrayContaining(['get', 'patch', 'delete']),
      );
    }
  });
});
