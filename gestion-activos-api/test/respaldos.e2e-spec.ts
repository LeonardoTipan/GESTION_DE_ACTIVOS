/**
 * Pruebas e2e de Respaldos y restauración (prototipo: plan → ejecución →
 * restauración), con anulación lógica, versiones con motivo e indicadores.
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
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const MOTIVO = 'Corrección documentada en el acta de revisión PR-10/2026.';

const PARAMETROS = {
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
};

describe('Respaldos y restauración (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = { critico: 0, comun: 0, deBaja: 0, malEstado: 0 };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const categoria = await prisma.categoria.create({ data: { nombre: 'Hardware', descripcion: '' } });
    const alta = await prisma.criticidad.create({ data: { nivel: 'Alta' } });
    const media = await prisma.criticidad.create({ data: { nivel: 'Media' } });
    const activo = (codigo: string, criticidadId: number, extra: object = {}) =>
      prisma.activo.create({
        data: {
          codigo,
          nombre: `Equipo ${codigo}`,
          sistemas: 'ERP',
          custodio: 'Infraestructura',
          ubicacion: 'Centro de datos',
          cifrado: true,
          ultimaRevision: new Date('2026-09-01'),
          categoriaId: categoria.id,
          criticidadId,
          estado: 'Bueno',
          ...extra,
        },
      });
    ids.critico = (await activo('SRV-BD', alta.id)).id;
    ids.comun = (await activo('PC-01', media.id)).id;
    ids.deBaja = (await activo('PC-VIEJO', media.id, { deletedAt: new Date() })).id;
    ids.malEstado = (await activo('PC-DESECHO', media.id, { estado: 'Desechado' })).id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const api = (token?: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };

  let planId = 0;
  let ejecucionId = 0;
  let restauracionId = 0;

  const ejecucion = (extra: object = {}) => ({
    planId,
    fecha: diasAtras(2),
    tipo: 'COMPLETO',
    medio: 'CINTA_LTO8',
    volumenGb: 820,
    duracionMin: 214,
    rpoHoras: 24,
    resultado: 'EXITOSO',
    responsable: 'Coordinación de Infraestructura',
    cifrado: true,
    fueraSitio: true,
    inmutable: true,
    integridad: true,
    ...extra,
  });

  describe('Paso 1 · Plan de respaldo (alcance)', () => {
    it('el auditor no registra (403); sin sesión, 401', async () => {
      await api().get('/api/respaldos/planes').expect(401);
      await api(tokens.auditor)
        .post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [ids.critico] })
        .expect(403);
    }, LENTO);

    it('crea un plan por cada activo seleccionado, con los mismos parámetros', async () => {
      const res = await api(tokens.analista)
        .post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [ids.critico, ids.comun] })
        .expect(201);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        activoId: ids.critico,
        estado: 'VIGENTE',
        version: 1,
        anuladoEn: null,
        medio: 'CINTA_LTO8',
        activo: { codigo: 'SRV-BD', criticidad: 'Alta' },
      });
      planId = res.body[0].id;
    }, LENTO);

    it('un activo con plan vigente no recibe otro (409)', async () => {
      const res = await api(tokens.analista)
        .post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [ids.critico] })
        .expect(409);
      expect(res.body.message).toContain('SRV-BD');
    }, LENTO);

    it('rechaza activos dados de baja o en un estado no operativo (validado en el backend)', async () => {
      for (const id of [ids.deBaja, ids.malEstado]) {
        const res = await api(tokens.admin)
          .post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [id] })
          .expect(400);
        expect(res.body.message).toContain('no está operativo');
      }
      await api(tokens.admin).post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [999999] }).expect(400);
      // Nada a medias: si uno falla, no se crea ninguno.
      expect(await prisma.planRespaldo.count()).toBe(2);
    }, LENTO);

    it('validaciones: catálogos, números, justificación y lista de activos', async () => {
      const base = { ...PARAMETROS, activoIds: [ids.comun] };
      await api(tokens.admin).post('/api/respaldos/planes', { ...base, activoIds: [] }).expect(400);
      await api(tokens.admin).post('/api/respaldos/planes', { ...base, medio: 'USB' }).expect(400);
      await api(tokens.admin).post('/api/respaldos/planes', { ...base, rpoHoras: 0 }).expect(400);
      await api(tokens.admin).post('/api/respaldos/planes', { ...base, justificacion: 'corta' }).expect(400);
    }, LENTO);

    it('modificar exige motivo de al menos 20 caracteres y sube la versión', async () => {
      await api(tokens.analista)
        .patch(`/api/respaldos/planes/${planId}`, { medio: 'NUBE_INMUTABLE' })
        .expect(400);
      await api(tokens.analista)
        .patch(`/api/respaldos/planes/${planId}`, { medio: 'NUBE_INMUTABLE', motivoCambio: 'corto' })
        .expect(400);
      const res = await api(tokens.analista)
        .patch(`/api/respaldos/planes/${planId}`, { medio: 'NUBE_INMUTABLE', motivoCambio: MOTIVO })
        .expect(200);
      expect(res.body).toMatchObject({ medio: 'NUBE_INMUTABLE', version: 2 });
      // Sin cambios reales no hay versión nueva.
      await api(tokens.analista)
        .patch(`/api/respaldos/planes/${planId}`, { medio: 'NUBE_INMUTABLE', motivoCambio: MOTIVO })
        .expect(400);
      // El activo de un plan no se cambia.
      await api(tokens.analista)
        .patch(`/api/respaldos/planes/${planId}`, { activoId: ids.comun, motivoCambio: MOTIVO })
        .expect(400);
    }, LENTO);

    it('las trazas conservan la versión anterior, el motivo y el autor', async () => {
      const res = await api(tokens.auditor)
        .get(`/api/trazas?entidad=PLAN_RESPALDO&registroId=${planId}`)
        .expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          accion: 'MODIFICAR',
          version: 1,
          motivo: MOTIVO,
          responsable: 'analista.test',
          cambios: [{ campo: 'medio', antes: 'CINTA_LTO8', despues: 'NUBE_INMUTABLE' }],
        }),
      ]);
    }, LENTO);
  });

  describe('Paso 2 · Ejecución del respaldo', () => {
    it('registra una ejecución sobre un plan vigente', async () => {
      const res = await api(tokens.analista).post('/api/respaldos/ejecuciones', ejecucion()).expect(201);
      expect(res.body).toMatchObject({
        planId,
        activoId: ids.critico,
        resultado: 'EXITOSO',
        version: 1,
        activo: { codigo: 'SRV-BD' },
      });
      ejecucionId = res.body.id;
    }, LENTO);

    it('rechaza fechas futuras, plan inexistente y plan suspendido', async () => {
      const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      await api(tokens.analista).post('/api/respaldos/ejecuciones', ejecucion({ fecha: manana })).expect(400);
      await api(tokens.analista).post('/api/respaldos/ejecuciones', ejecucion({ planId: 999999 })).expect(400);

      const otro = (await prisma.planRespaldo.findFirstOrThrow({ where: { activoId: ids.comun } })).id;
      await api(tokens.analista)
        .patch(`/api/respaldos/planes/${otro}`, { estado: 'SUSPENDIDO', motivoCambio: MOTIVO })
        .expect(200);
      const res = await api(tokens.analista)
        .post('/api/respaldos/ejecuciones', ejecucion({ planId: otro }))
        .expect(400);
      expect(res.body.message).toContain('no está vigente');
    }, LENTO);

    it('listado con filtros de período y resultado', async () => {
      await api(tokens.analista)
        .post('/api/respaldos/ejecuciones', ejecucion({ fecha: diasAtras(1), resultado: 'FALLIDO', cifrado: false }))
        .expect(201);
      const todas = await api(tokens.auditor).get('/api/respaldos/ejecuciones').expect(200);
      expect(todas.body.meta.total).toBe(2);
      const fallidas = await api(tokens.auditor).get('/api/respaldos/ejecuciones?resultado=FALLIDO').expect(200);
      expect(fallidas.body.meta.total).toBe(1);
      const periodo = await api(tokens.auditor)
        .get(`/api/respaldos/ejecuciones?desde=${diasAtras(2)}&hasta=${diasAtras(2)}`)
        .expect(200);
      expect(periodo.body.meta.total).toBe(1);
    }, LENTO);
  });

  describe('Paso 3 · Restauración o prueba', () => {
    const restauracion = (extra: object = {}) => ({
      ejecucionId,
      fecha: diasAtras(1),
      motivo: 'PRUEBA_PROGRAMADA',
      resultado: 'EXITOSO',
      tiempoRealMin: 96,
      rtoMinutos: 240,
      integridad: true,
      evidencia: 'Acta PR-07/2026',
      responsable: 'Coordinación de Infraestructura',
      ...extra,
    });

    it('registra la restauración de una ejecución exitosa', async () => {
      const res = await api(tokens.analista).post('/api/respaldos/restauraciones', restauracion()).expect(201);
      expect(res.body).toMatchObject({ ejecucionId, activoId: ids.critico, evidencia: 'Acta PR-07/2026' });
      restauracionId = res.body.id;
    }, LENTO);

    it('no restaura una ejecución fallida, ni antes de que se ejecutara', async () => {
      const fallida = await prisma.ejecucionRespaldo.findFirstOrThrow({ where: { resultado: 'FALLIDO' } });
      const res = await api(tokens.analista)
        .post('/api/respaldos/restauraciones', restauracion({ ejecucionId: fallida.id }))
        .expect(400);
      expect(res.body.message).toContain('falló');
      await api(tokens.analista)
        .post('/api/respaldos/restauraciones', restauracion({ fecha: diasAtras(5) }))
        .expect(400);
      await api(tokens.analista)
        .post('/api/respaldos/restauraciones', restauracion({ evidencia: '' }))
        .expect(400);
    }, LENTO);
  });

  describe('Indicadores y calendarios (tablero)', () => {
    it('calcula RES-00…RES-07 con los registros vigentes del período', async () => {
      const { body } = await api(tokens.auditor).get('/api/respaldos/tablero').expect(200);
      const ind = Object.fromEntries(body.indicadores.map((i: { id: string }) => [i.id, i]));
      expect(Object.keys(ind)).toEqual(['RES-00', 'RES-01b', 'RES-01', 'RES-02', 'RES-03', 'RES-04', 'RES-05', 'RES-06', 'RES-07']);
      // Único activo crítico operativo (SRV-BD) con plan vigente.
      expect(ind['RES-00']).toMatchObject({ valor: 100, estado: 'EN_META' });
      // 2 ejecuciones (1 exitosa, 1 fallida sin cifrar) en los últimos días.
      expect(ind['RES-01']).toMatchObject({ valor: 50, estado: 'FUERA_DE_META' });
      expect(ind['RES-02']).toMatchObject({ valor: 50 });
      expect(ind['RES-05']).toMatchObject({ valor: 100 });
      expect(ind['RES-06']).toMatchObject({ valor: 96, estado: 'EN_META' });
      // Calendario: solo los planes vigentes (el suspendido no aparece).
      expect(body.calendario.map((c: { planId: number }) => c.planId)).toEqual([planId]);
      expect(body.calendario[0].ejecucion.length).toBeGreaterThan(0);
    }, LENTO);

    it('el período se valida', async () => {
      await api(tokens.auditor).get('/api/respaldos/tablero?desde=2026-09-30&hasta=2026-07-01').expect(400);
      await api(tokens.auditor).get('/api/respaldos/tablero?desde=no-es-fecha').expect(400);
    }, LENTO);
  });

  describe('Anulación lógica y reversión', () => {
    it('solo el admin anula, y con motivo de al menos 20 caracteres', async () => {
      await api(tokens.analista)
        .post(`/api/respaldos/ejecuciones/${ejecucionId}/anular`, { motivo: MOTIVO })
        .expect(403);
      await api(tokens.admin)
        .post(`/api/respaldos/ejecuciones/${ejecucionId}/anular`, { motivo: 'corto' })
        .expect(400);
      const res = await api(tokens.admin)
        .post(`/api/respaldos/ejecuciones/${ejecucionId}/anular`, { motivo: MOTIVO })
        .expect(200);
      expect(res.body).toMatchObject({ anuladoPor: 'admin.test', motivoAnulacion: MOTIVO });
      expect(res.body.anuladoEn).not.toBeNull();
    }, LENTO);

    it('el registro anulado se conserva, se ve marcado y sale de los indicadores', async () => {
      expect(await prisma.ejecucionRespaldo.count({ where: { id: ejecucionId } })).toBe(1);
      const lista = await api(tokens.auditor).get('/api/respaldos/ejecuciones').expect(200);
      expect(lista.body.meta.total).toBe(2);
      const vigentes = await api(tokens.auditor)
        .get('/api/respaldos/ejecuciones?incluirAnulados=false')
        .expect(200);
      expect(vigentes.body.meta.total).toBe(1);
      const { body } = await api(tokens.auditor).get('/api/respaldos/tablero').expect(200);
      const exito = body.indicadores.find((i: { id: string }) => i.id === 'RES-01');
      expect(exito.valor).toBe(0); // solo queda la fallida
      // No se modifica ni se restaura un registro anulado.
      await api(tokens.analista)
        .patch(`/api/respaldos/ejecuciones/${ejecucionId}`, { volumenGb: 1, motivoCambio: MOTIVO })
        .expect(409);
      await api(tokens.analista)
        .post('/api/respaldos/restauraciones', {
          ejecucionId,
          fecha: diasAtras(1),
          motivo: 'INCIDENTE_DISPONIBILIDAD',
          resultado: 'EXITOSO',
          tiempoRealMin: 10,
          rtoMinutos: 240,
          integridad: true,
          evidencia: 'Ticket INC-1',
          responsable: 'Mesa de Servicios',
        })
        .expect(400);
    }, LENTO);

    it('revertir lo devuelve a los indicadores; la anulación queda en las trazas', async () => {
      await api(tokens.admin)
        .post(`/api/respaldos/ejecuciones/${ejecucionId}/reversar`, { motivo: MOTIVO })
        .expect(200);
      await api(tokens.admin)
        .post(`/api/respaldos/ejecuciones/${ejecucionId}/reversar`, { motivo: MOTIVO })
        .expect(409);
      const trazas = await api(tokens.auditor)
        .get(`/api/trazas?entidad=EJECUCION_RESPALDO&registroId=${ejecucionId}`)
        .expect(200);
      expect(trazas.body.map((t: { accion: string }) => t.accion)).toEqual(['REVERSAR', 'ANULAR']);
    }, LENTO);

    it('revertir un plan anulado no puede dejar dos planes vigentes para el mismo activo', async () => {
      await api(tokens.admin).post(`/api/respaldos/planes/${planId}/anular`, { motivo: MOTIVO }).expect(200);
      const nuevo = await api(tokens.analista)
        .post('/api/respaldos/planes', { ...PARAMETROS, activoIds: [ids.critico] })
        .expect(201);
      const res = await api(tokens.admin)
        .post(`/api/respaldos/planes/${planId}/reversar`, { motivo: MOTIVO })
        .expect(409);
      expect(res.body.message).toContain('plan de respaldo vigente');
      expect(nuevo.body[0].id).not.toBe(planId);
    }, LENTO);

    it('no existe el borrado físico: DELETE no está disponible', async () => {
      await api(tokens.admin).delete(`/api/respaldos/ejecuciones/${ejecucionId}`).expect(404);
      await api(tokens.admin).delete(`/api/respaldos/restauraciones/${restauracionId}`).expect(404);
    }, LENTO);
  });

  describe('Registros anteriores y conservación del historial', () => {
    it('los respaldos del modelo anterior se consultan y no se pueden crear por la API', async () => {
      const anterior = await prisma.respaldo.create({
        data: { activoId: ids.comun, alcanceDetalle: 'Registro previo al plan' },
      });
      const lista = await api(tokens.auditor).get('/api/respaldos/anteriores').expect(200);
      expect(lista.body.data.map((r: { id: number }) => r.id)).toEqual([anterior.id]);
      await api(tokens.auditor).get(`/api/respaldos/anteriores/${anterior.id}`).expect(200);
      await api(tokens.admin).post('/api/respaldos/anteriores', { activoId: ids.comun, alcanceDetalle: 'x' }).expect(404);
    }, LENTO);

    it('dar de baja el activo conserva sus planes y ejecuciones, consultables, pero no admite nuevos', async () => {
      await api(tokens.admin).delete(`/api/activos/${ids.critico}`).expect(204);
      const planes = await api(tokens.auditor).get(`/api/respaldos/planes?activoId=${ids.critico}`).expect(200);
      expect(planes.body.meta.total).toBe(2);
      await api(tokens.auditor).get(`/api/respaldos/ejecuciones/${ejecucionId}`).expect(200);
      const plan = planes.body.data.find((p: { anuladoEn: string | null }) => !p.anuladoEn);
      const res = await api(tokens.analista)
        .post('/api/respaldos/ejecuciones', ejecucion({ planId: plan.id }))
        .expect(400);
      expect(res.body.message).toContain('fue dado de baja');
      // Y el tablero ya no lo cuenta como crítico operativo.
      const { body } = await api(tokens.auditor).get('/api/respaldos/tablero').expect(200);
      expect(body.calendario).toEqual([]);
    }, LENTO);

    it('la base impide borrar físicamente un activo con planes (clave foránea)', async () => {
      await expect(prisma.activo.delete({ where: { id: ids.critico } })).rejects.toMatchObject({
        code: 'P2003',
      });
    }, LENTO);
  });

  it('Swagger documenta los tres pasos, el tablero, anular y reversar', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const ruta of ['planes', 'ejecuciones', 'restauraciones']) {
      expect(body.paths[`/api/respaldos/${ruta}`]).toHaveProperty('post');
      expect(body.paths[`/api/respaldos/${ruta}/{id}`]).toHaveProperty('patch');
      expect(body.paths[`/api/respaldos/${ruta}/{id}`]).not.toHaveProperty('delete');
      expect(body.paths[`/api/respaldos/${ruta}/{id}/anular`]).toHaveProperty('post');
      expect(body.paths[`/api/respaldos/${ruta}/{id}/reversar`]).toHaveProperty('post');
    }
    expect(body.paths['/api/respaldos/tablero']).toHaveProperty('get');
    expect(body.paths['/api/trazas']).toHaveProperty('get');
    expect(body.paths['/api/respaldos/anteriores']).not.toHaveProperty('post');
  });

});
