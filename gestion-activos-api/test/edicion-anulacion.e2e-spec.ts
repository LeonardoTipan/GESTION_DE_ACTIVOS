/**
 * Pruebas e2e de EDITAR (con motivo y versión) y ANULAR (eliminación lógica)
 * en mantenimientos y vulnerabilidades, sus indicadores, y la integridad entre
 * estos registros y los activos. Contra MySQL (gestion_activos_test) y Keycloak.
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
const PLAN = {
  frecuencia: 'MENSUAL',
  tipo: 'COMPLETO',
  medio: 'DISCO_A_DISCO',
  ventana: 'NOCTURNA_22_02',
  retencion: 'ANIO_1',
  frecuenciaPrueba: 'TRIMESTRAL',
  rpoHoras: 24,
  rtoMinutos: 240,
  responsable: 'Infraestructura',
  justificacion: 'Servidor con información institucional que requiere continuidad.',
};

const MOTIVO = 'Corrección registrada tras la revisión del acta PR-10/2026.';

describe('Editar con motivo y anular (e2e)', () => {
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
        .patch(`/api/mantenimientos/${id}`, { motivoCambio: MOTIVO,  tipo: 'CORRECTIVO', actividad: 'Cambio de disco' })
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
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { motivoCambio: MOTIVO,  activoId: 999 }).expect(400);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { motivoCambio: MOTIVO,  fase: 'FINALIZADO' }).expect(400);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { motivoCambio: MOTIVO,  tipo: 'OTRO' }).expect(400);
    });

    it('una vez iniciado ya no se edita → 409', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(200);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { motivoCambio: MOTIVO,  actividad: 'Otra' })
        .expect(409);
      expect(res.body.message).toContain('EN_EJECUCION');
    });

    it('editar exige motivo de al menos 20 caracteres, sube la versión y deja traza', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).patch(`/api/mantenimientos/${id}`, { actividad: 'Otra' }).expect(400);
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { actividad: 'Otra', motivoCambio: 'corto' })
        .expect(400);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { actividad: 'Otra', motivoCambio: MOTIVO })
        .expect(200);
      expect(res.body.version).toBe(2);
      const trazas = await api(tokens.auditor)
        .get(`/api/trazas?entidad=MANTENIMIENTO&registroId=${id}`)
        .expect(200);
      expect(trazas.body[0]).toMatchObject({
        accion: 'MODIFICAR',
        version: 1,
        responsable: 'analista.test',
        cambios: [{ campo: 'actividad', antes: 'Limpieza', despues: 'Otra' }],
      });
    });

    it('anular: solo el admin, con motivo; se conserva, no admite cambios de fase y se puede revertir', async () => {
      const { id } = await nuevo();
      await api(tokens.analista).post(`/api/mantenimientos/${id}/anular`, { motivo: MOTIVO }).expect(403);
      await api(tokens.admin).post(`/api/mantenimientos/${id}/anular`, { motivo: 'corto' }).expect(400);
      const anulado = await api(tokens.admin)
        .post(`/api/mantenimientos/${id}/anular`, { motivo: MOTIVO })
        .expect(200);
      expect(anulado.body).toMatchObject({ id, anuladoPor: 'admin.test', motivoAnulacion: MOTIVO });
      // Sigue existiendo y se consulta.
      await api(tokens.auditor).get(`/api/mantenimientos/${id}`).expect(200);
      // Ni cambia de fase ni se edita.
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(409);
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}`, { actividad: 'X', motivoCambio: MOTIVO })
        .expect(409);
      // Se oculta con incluirAnulados=false.
      const vigentes = await api(tokens.auditor).get('/api/mantenimientos?incluirAnulados=false').expect(200);
      expect(vigentes.body.data.some((m: { id: number }) => m.id === id)).toBe(false);
      // Revertir.
      await api(tokens.admin).post(`/api/mantenimientos/${id}/reversar`, { motivo: MOTIVO }).expect(200);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`).expect(200);
    });

    it('no hay borrado físico: DELETE ya no existe', async () => {
      const { id } = await nuevo();
      await api(tokens.admin).delete(`/api/mantenimientos/${id}`).expect(404);
      await api(tokens.admin).get(`/api/mantenimientos/${id}`).expect(200);
    });

    it('indicadores (A.7.13): los anulados no cuentan', async () => {
      const { body } = await api(tokens.auditor).get('/api/mantenimientos/indicadores').expect(200);
      expect(body.map((i: { id: string }) => i.id)).toEqual(['MAN-01', 'MAN-02', 'MAN-03', 'MAN-04', 'MAN-05']);
      expect(body[0]).toMatchObject({ control: 'A.7.13' });
      const total = await prisma.mantenimiento.count({ where: { anuladoEn: null } });
      const anulados = await prisma.mantenimiento.count({ where: { anuladoEn: { not: null } } });
      expect(total).toBeGreaterThan(0);
      expect(anulados).toBe(0); // el anulado se revirtió
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
        .patch(`/api/vulnerabilidades/${id}`, { motivoCambio: MOTIVO, 
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
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { motivoCambio: MOTIVO,  fechaLimite: ayer }).expect(400);
    });

    it('no puede quedar con el CVE de otra vulnerabilidad pendiente del mismo activo → 409', async () => {
      await nueva({ cve: 'CVE-2026-22222' });
      const { id } = await nueva();
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { motivoCambio: MOTIVO,  cve: 'CVE-2026-22222' }).expect(409);
    });

    it('una vez cerrada ya no se edita → 409', async () => {
      const { id } = await nueva();
      await api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, { justificacion: 'Sistema aislado' })
        .expect(200);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { motivoCambio: MOTIVO,  descripcion: 'Otra' }).expect(409);
    });

    it('anular: solo el admin, con motivo; no admite cambios de estado; revertir la reactiva', async () => {
      const { id } = await nueva();
      await api(tokens.analista).post(`/api/vulnerabilidades/${id}/anular`, { motivo: MOTIVO }).expect(403);
      await api(tokens.admin).post(`/api/vulnerabilidades/${id}/anular`, { motivo: MOTIVO }).expect(200);
      await api(tokens.admin).post(`/api/vulnerabilidades/${id}/anular`, { motivo: MOTIVO }).expect(409);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`).expect(409);
      await api(tokens.admin).delete(`/api/vulnerabilidades/${id}`).expect(404);
      await api(tokens.admin).post(`/api/vulnerabilidades/${id}/reversar`, { motivo: MOTIVO }).expect(200);
      // Tras revertir sigue el flujo normal: confirmar y evaluar antes del tratamiento.
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/confirmar`).expect(200);
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/evaluar`, { prioridad: 'P3', responsable: 'TIC', planRemediacion: 'Parche en la próxima ventana.' })
        .expect(200);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`).expect(200);
      const trazas = await api(tokens.auditor)
        .get(`/api/trazas?entidad=VULNERABILIDAD&registroId=${id}`)
        .expect(200);
      expect(trazas.body.map((t: { accion: string }) => t.accion)).toEqual(['MODIFICAR', 'MODIFICAR', 'MODIFICAR', 'REVERSAR', 'ANULAR']);
    });

    it('indicadores (A.8.8): una anulada deja de contar como abierta', async () => {
      const critica = await nueva({ nivelRiesgo: 'CRITICO', cve: 'CVE-2026-33333' });
      const antes = await api(tokens.auditor).get('/api/vulnerabilidades/indicadores').expect(200);
      const abiertas = (r: { body: { id: string; valor: number }[] }) =>
        r.body.find((i) => i.id === 'VUL-01')!.valor;
      await api(tokens.admin).post(`/api/vulnerabilidades/${critica.id}/anular`, { motivo: MOTIVO }).expect(200);
      const despues = await api(tokens.auditor).get('/api/vulnerabilidades/indicadores').expect(200);
      expect(abiertas(despues)).toBe(abiertas(antes) - 1);
      expect(despues.body.map((i: { id: string }) => i.id)).toEqual(['VUL-01', 'VUL-02', 'VUL-03', 'VUL-04']);
    });
  });

  describe('integridad con los activos', () => {
    it('dar de baja un activo con registros asociados no da error ni los borra', async () => {
      const otro = await prisma.activo.create({
        data: { ...datosActivo, codigo: 'SRV-CON-HISTORIAL' } as never,
      });
      const [plan] = (await api(tokens.analista).post('/api/respaldos/planes', { ...PLAN, activoIds: [otro.id] }).expect(201)).body as { id: number }[];
      const mantenimiento = await crear('/api/mantenimientos', {
        activoId: otro.id,
        tipo: 'PREVENTIVO',
        actividad: 'Limpieza',
        fecha: MANANA,
      });

      await api(tokens.admin).delete(`/api/activos/${otro.id}`).expect(204);

      // El historial sigue consultable, con los datos del activo dado de baja.
      const r = await api(tokens.auditor).get(`/api/respaldos/planes/${plan.id}`).expect(200);
      expect(r.body.activo).toMatchObject({ id: otro.id, codigo: 'SRV-CON-HISTORIAL' });
      await api(tokens.auditor).get(`/api/mantenimientos/${mantenimiento.id}`).expect(200);
      // Y ya no se pueden abrir registros nuevos sobre él.
      await api(tokens.analista)
        .post('/api/respaldos/planes', { ...PLAN, activoIds: [otro.id] })
        .expect(400);
    });

    it('la base impide borrar físicamente un activo con registros (clave foránea)', async () => {
      await api(tokens.analista).post('/api/respaldos/planes', { ...PLAN, activoIds: [activoId] }).expect(201);
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
          const respaldos = await api(tokens.auditor).get('/api/respaldos/anteriores').expect(200);
          const mantenimientos = await api(tokens.auditor).get('/api/mantenimientos').expect(200);
          await api(tokens.auditor).get('/api/vulnerabilidades').expect(200);

          // Los huérfanos no se muestran y el total cuadra con lo listado.
          expect(respaldos.body.data.every((r: { activoId: number }) => r.activoId !== 987654)).toBe(true);
          expect(respaldos.body.meta.total).toBe(
            await prisma.respaldo.count({ where: { activoId: { not: 987654 } } }),
          );
          expect(mantenimientos.body.data.every((m: { activoId: number }) => m.activoId !== 987654)).toBe(true);
          await api(tokens.auditor).get(`/api/respaldos/anteriores/${huerfano.id}`).expect(404);
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
        for (const ruta of ['activos', 'respaldos/planes', 'respaldos/ejecuciones', 'respaldos/restauraciones', 'respaldos/anteriores', 'mantenimientos', 'vulnerabilidades', 'categorias', 'criticidades']) {
          const res = await api(tokens.auditor).get(`/api/${ruta}`).expect(200);
          expect(Array.isArray(res.body) ? res.body : res.body.data).toEqual([]);
        }
      },
      LENTO,
    );
  });

  it('Swagger documenta editar, anular y reversar (sin borrado físico)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const ruta of ['mantenimientos', 'vulnerabilidades']) {
      expect(Object.keys(res.body.paths[`/api/${ruta}/{id}`])).toEqual(expect.arrayContaining(['get', 'patch']));
      expect(res.body.paths[`/api/${ruta}/{id}`]).not.toHaveProperty('delete');
      expect(res.body.paths[`/api/${ruta}/{id}/anular`]).toHaveProperty('post');
      expect(res.body.paths[`/api/${ruta}/{id}/reversar`]).toHaveProperty('post');
      expect(res.body.paths[`/api/${ruta}/indicadores`]).toHaveProperty('get');
    }
  });
});
