/**
 * Pruebas e2e de la sincronización lanzada desde la aplicación (botón manual),
 * los avisos, el filtro por estado y las reglas de los módulos de respaldos,
 * mantenimientos y vulnerabilidades sobre equipos dados de baja o no operativos.
 *
 * API real + MySQL real (gestion_activos_test) + Keycloak de desarrollo.
 * GLPI es simulado: ninguna prueba contacta con el servidor de la empresa.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { FabricaSincronizador } from './../src/glpi-sync/api/glpi-sync.service.js';
import type { GlpiSyncConfig } from './../src/glpi-sync/config.js';
import { GlpiClient, type GlpiItem } from './../src/glpi-sync/glpi-client.js';
import { InventarioPrisma } from './../src/glpi-sync/inventario-local.js';
import { Sincronizador } from './../src/glpi-sync/sincronizador.js';
import { glpiFalso, type DatosGlpiFalso } from './../src/glpi-sync/testing/glpi-falso.js';
import {
  equipoDeRed,
  ordenadores,
} from './../src/glpi-sync/testing/inventario-ejemplo.js';
import { CONFIG_PRUEBA } from './../src/glpi-sync/testing/inventario-en-memoria.js';
import { BitacoraService } from './../src/inventory/bitacora/bitacora.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupSwagger } from './../src/swagger.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 120_000;
const MANANA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
  justificacion: 'Equipo con información institucional que requiere continuidad.',
};
/** "Ahora" tal como lo escribiría el GLPI de Quito (UTC−5). */
const ahoraGlpi = () =>
  `${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19)}-05:00`;

describe('Sincronización con GLPI desde la aplicación (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;

  const glpi: DatosGlpiFalso = {
    elementos: { Computer: ordenadores(), NetworkEquipment: [equipoDeRed()] },
  };
  const falso = glpiFalso(glpi);
  let configurado = true;
  const pc = (id: number): GlpiItem => glpi.elementos.Computer.find((x) => x.id === id)!;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      // El motor REAL (Prisma + bitácora), conectado a un GLPI simulado.
      .overrideProvider(FabricaSincronizador)
      .useValue({
        config: (): GlpiSyncConfig => {
          if (!configurado) throw new Error('Falta GLPI_API_URL');
          return { ...CONFIG_PRUEBA, databaseUrl: process.env.DATABASE_URL! };
        },
        crear: (config: GlpiSyncConfig) =>
          new Sincronizador(
            config,
            new GlpiClient({ ...config, fetch: falso.fetch }),
            new InventarioPrisma(prisma, new BitacoraService(prisma)),
            () => {},
          ),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    await prisma.categoria.createMany({
      data: [
        { nombre: 'Hardware', descripcion: '' },
        { nombre: 'Red', descripcion: '' },
      ],
    });
    await prisma.criticidad.create({ data: { nivel: 'Media' } });
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const api = (token?: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) =>
      token ? req.set('Authorization', `Bearer ${token}`) : req;
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };
  const sincronizar = async (cuerpo: object = {}) =>
    (await api(tokens.analista).post('/api/glpi/sincronizacion', cuerpo).expect(200)).body;
  const activoDe = (referencia: string) =>
    prisma.activo.findUniqueOrThrow({ where: { origenGlpi: referencia } });
  const total = async (consulta: string) =>
    (await api(tokens.auditor).get(`/api/activos?limit=1&${consulta}`).expect(200)).body.meta
      .total as number;

  describe('13 · botón manual: seguridad', () => {
    it('sin sesión → 401; el auditor no puede sincronizar → 403; nada se escribe', async () => {
      await api().post('/api/glpi/sincronizacion').expect(401);
      await api().get('/api/glpi/sincronizacion').expect(401);
      await api(tokens.auditor).post('/api/glpi/sincronizacion').expect(403);
      expect(await prisma.sincronizacion.count()).toBe(0);
      expect(await prisma.activo.count()).toBe(0);
      expect(falso.peticiones).toEqual([]);
    }, LENTO);

    it('el estado inicial indica que nunca se ha sincronizado', async () => {
      const { body } = await api(tokens.auditor).get('/api/glpi/sincronizacion').expect(200);
      expect(body).toEqual({ configurado: true, enCurso: false, ultimaExitosa: null, ultima: null });
    }, LENTO);

    it('la respuesta nunca contiene credenciales de GLPI', async () => {
      const { body } = await api(tokens.auditor).get('/api/glpi/sincronizacion').expect(200);
      expect(JSON.stringify(body)).not.toMatch(/secreto|clave-de-prueba|token-/);
    }, LENTO);

    it('si GLPI no está configurado en el servidor → 503 sin detalles internos', async () => {
      configurado = false;
      try {
        const res = await api(tokens.admin).post('/api/glpi/sincronizacion').expect(503);
        expect(res.body.message).not.toContain('GLPI_API_URL');
        const estado = await api(tokens.admin).get('/api/glpi/sincronizacion').expect(200);
        expect(estado.body.configurado).toBe(false);
      } finally {
        configurado = true;
      }
    }, LENTO);
  });

  describe('1 y 2 · importación inicial y segunda sincronización', () => {
    it('la primera vez es COMPLETA: importa los 26 y registra quién la lanzó', async () => {
      const res = await sincronizar();
      expect(res).toMatchObject({
        modo: 'COMPLETA',
        origen: 'MANUAL',
        estado: 'EXITOSA',
        solicitadaPor: 'analista.test',
        puntoControlAvanzado: true,
        errores: [],
        contadores: { leidos: 26, creados: 26, errores: 0, detectados: 26, aplicados: 26 },
      });
      expect(res.cambios).toHaveLength(26);
      expect(JSON.stringify(res)).not.toMatch(/secreto|clave-de-prueba|token-/);
      expect(await prisma.activo.count()).toBe(26);
      expect(await prisma.notificacion.count({ where: { tipo: 'ALTA' } })).toBe(26);
    }, LENTO);

    it('el estado informa de la última sincronización exitosa', async () => {
      const { body } = await api(tokens.auditor).get('/api/glpi/sincronizacion').expect(200);
      expect(body.enCurso).toBe(false);
      expect(Date.now() - Date.parse(body.ultimaExitosa)).toBeLessThan(LENTO);
      expect(body.ultima).toMatchObject({ estado: 'EXITOSA', modo: 'COMPLETA' });
    }, LENTO);

    it('la segunda es INCREMENTAL: no lee nada, no duplica y no genera avisos ni historial', async () => {
      const antes = {
        avisos: await prisma.notificacion.count(),
        historial: await prisma.bitacoraHistorial.count(),
      };
      const res = await sincronizar();
      expect(res).toMatchObject({
        modo: 'INCREMENTAL',
        estado: 'EXITOSA',
        cambios: [],
        contadores: { leidos: 0, creados: 0, actualizados: 0, detectados: 0 },
      });
      expect(await prisma.activo.count()).toBe(26);
      expect(await prisma.notificacion.count()).toBe(antes.avisos);
      expect(await prisma.bitacoraHistorial.count()).toBe(antes.historial);
    }, LENTO);
  });

  describe('4, 5 y 6 · cambios reales, historial y avisos', () => {
    let activoId: number;

    it('un cambio en GLPI se aplica, queda en el historial con antes y después, y conserva los datos locales', async () => {
      activoId = (await activoDe('Computer #5')).id;
      // Datos que solo existen en la aplicación.
      await api(tokens.analista)
        .patch(`/api/activos/${activoId}`, { cifrado: true, direccionIp: '10.0.0.5' })
        .expect(200);
      await api(tokens.admin).post('/api/notificaciones/marcar-leidas').expect(204);

      Object.assign(pc(5), {
        status: { id: 1, name: 'Malo' },
        location: { id: 12, name: 'Bodega' },
        date_mod: ahoraGlpi(),
      });
      const res = await sincronizar();
      expect(res.contadores).toMatchObject({ leidos: 1, actualizados: 1, detectados: 1, aplicados: 1 });
      expect(res.cambios).toEqual([
        expect.objectContaining({
          referencia: 'Computer #5',
          activoId,
          resultado: 'ACTUALIZAR',
          aplicado: true,
          campos: expect.arrayContaining(['estado', 'ubicacion']),
        }),
      ]);

      const activo = (await api(tokens.auditor).get(`/api/activos/${activoId}`).expect(200)).body;
      expect(activo).toMatchObject({
        estado: 'Malo',
        ubicacion: 'Bodega',
        cifrado: true,
        direccionIp: '10.0.0.5',
        inactivoDesde: null,
      });
      const bitacora = (
        await api(tokens.auditor).get(`/api/activos/${activoId}/bitacora`).expect(200)
      ).body.data;
      expect(bitacora[0]).toMatchObject({
        accion: 'ACTUALIZAR',
        responsable: 'GLPI',
        detalle: {
          estado: { antes: 'Bueno', despues: 'Malo' },
          ubicacion: { antes: 'TICs', despues: 'Bodega' },
        },
      });
    }, LENTO);

    it('genera UN aviso de cambio de estado, visible para todos los roles', async () => {
      const resumen = await api(tokens.auditor).get('/api/notificaciones/resumen').expect(200);
      expect(resumen.body).toEqual({ noLeidas: 1 });
      const lista = (
        await api(tokens.auditor).get('/api/notificaciones?soloNoLeidas=true').expect(200)
      ).body;
      expect(lista.meta.total).toBe(1);
      expect(lista.data[0]).toMatchObject({
        tipo: 'CAMBIO_ESTADO',
        activoId,
        leida: false,
        detalle: { estado: { antes: 'Bueno', despues: 'Malo' } },
      });
      expect(lista.data[0].titulo).toContain('Bueno → Malo');
    }, LENTO);

    it('volver a sincronizar sin cambios nuevos no repite el aviso', async () => {
      const res = await sincronizar(); // el elemento se relee (ventana de seguridad)
      expect(res.contadores).toMatchObject({ leidos: 1, sinCambios: 1, actualizados: 0, detectados: 0 });
      const resumen = await api(tokens.auditor).get('/api/notificaciones/resumen').expect(200);
      expect(resumen.body).toEqual({ noLeidas: 1 });
    }, LENTO);

    it('marcar como leído: el auditor no puede (403); analista y admin, sí', async () => {
      const [aviso] = (
        await api(tokens.auditor).get('/api/notificaciones?soloNoLeidas=true').expect(200)
      ).body.data;
      await api(tokens.auditor).patch(`/api/notificaciones/${aviso.id}/leida`).expect(403);
      await api(tokens.auditor).post('/api/notificaciones/marcar-leidas').expect(403);
      const leida = await api(tokens.analista)
        .patch(`/api/notificaciones/${aviso.id}/leida`)
        .expect(200);
      expect(leida.body.leida).toBe(true);
      await api(tokens.analista).patch('/api/notificaciones/999999/leida').expect(404);
      expect(
        (await api(tokens.auditor).get('/api/notificaciones/resumen').expect(200)).body,
      ).toEqual({ noLeidas: 0 });
    }, LENTO);
  });

  describe('3 · equipo nuevo', () => {
    it('la incremental incorpora solo el equipo nuevo', async () => {
      glpi.elementos.Computer.push({
        ...ordenadores()[0],
        id: 40,
        name: 'Laptop nueva',
        comment: 'QUITO TURISMO: 7-1-22-400',
        otherserial: '',
        date_creation: ahoraGlpi(),
        date_mod: ahoraGlpi(),
      });
      const res = await sincronizar();
      expect(res.modo).toBe('INCREMENTAL');
      expect(res.contadores).toMatchObject({ creados: 1, aplicados: 1 });
      expect(await activoDe('Computer #40')).toMatchObject({ codigo: '7-1-22-400' });
      expect(await prisma.activo.count()).toBe(27);
    }, LENTO);
  });

  describe('7, 8 y 9 · de activo a dado de baja; operaciones solo sobre equipos operativos', () => {
    let activoId: number;
    const registros: { respaldo: number; mantenimiento: number; vulnerabilidad: number } = {
      respaldo: 0,
      mantenimiento: 0,
      vulnerabilidad: 0,
    };
    const operaciones = (id: number): [string, object][] => [
      ['/api/respaldos/planes', { ...PLAN, activoIds: [id] }],
      ['/api/mantenimientos', { activoId: id, tipo: 'PREVENTIVO', actividad: 'Limpieza', fecha: MANANA, fechaLimite: MANANA }],
      ['/api/vulnerabilidades', { activoId: id, descripcion: 'Parche pendiente', nivelRiesgo: 'ALTO', fecha: AYER }],
    ];

    it('mientras está activo admite respaldos, mantenimientos y vulnerabilidades', async () => {
      activoId = (await activoDe('Computer #7')).id;
      const [r, m, v] = await Promise.all(
        operaciones(activoId).map(([url, cuerpo]) =>
          api(tokens.analista).post(url, cuerpo).expect(201),
        ),
      );
      Object.assign(registros, {
        respaldo: r.body[0].id,
        mantenimiento: m.body.id,
        vulnerabilidad: v.body.id,
      });
    }, LENTO);

    it('GLPI lo envía a la papelera → pasa a dado de baja, con historial y aviso', async () => {
      Object.assign(pc(7), { is_deleted: true, date_mod: ahoraGlpi() });
      const res = await sincronizar();
      expect(res.contadores).toMatchObject({ inactivados: 1, aplicados: 1 });
      expect(res.cambios[0]).toMatchObject({ referencia: 'Computer #7', resultado: 'INACTIVAR' });

      const activo = (await api(tokens.auditor).get(`/api/activos/${activoId}`).expect(200)).body;
      expect(activo.motivoInactivo).toBe('PAPELERA_GLPI');
      expect(activo.inactivoDesde).not.toBeNull();
      expect(activo.deletedAt).toBeNull();
      const bitacora = (
        await api(tokens.auditor).get(`/api/activos/${activoId}/bitacora`).expect(200)
      ).body.data;
      expect(bitacora[0]).toMatchObject({ accion: 'INACTIVAR', responsable: 'GLPI' });
      expect(bitacora.at(-1)).toMatchObject({ accion: 'CREAR' }); // el historial anterior sigue ahí
      expect(
        await prisma.notificacion.count({ where: { tipo: 'BAJA_DETECTADA', activoId } }),
      ).toBe(1);
    }, LENTO);

    it('filtro por estado: valores reales del inventario, dado de baja y solo operativos', async () => {
      // Sin filtro, el inventario lo muestra todo.
      expect(await total('')).toBe(27);
      // El ordenador #5 pasó a Malo; el #7 está dado de baja; el resto, Bueno.
      expect(await total('estado=Bueno')).toBe(25);
      expect(await total('estado=Malo')).toBe(1);
      expect(await total('estado=malo')).toBe(1); // sin distinguir mayúsculas
      expect(await total('estado=Regular')).toBe(0);
      expect(await total('estado=@baja')).toBe(1);
      expect(await total('estado=@sin-estado')).toBe(0);
      // Lo que alimenta los selectores de los módulos.
      expect(await total('operativos=true')).toBe(26);
      // Combinado con la búsqueda.
      expect(await total('estado=@baja&q=Laptop')).toBe(1);
      expect(await total('operativos=true&q=Laptop 7')).toBe(0);
    }, LENTO);

    it('GET /activos/estados devuelve los estados que hay, con su recuento (filtro dinámico)', async () => {
      const { body } = await api(tokens.auditor).get('/api/activos/estados').expect(200);
      expect(body).toEqual([
        { clave: 'Bueno', etiqueta: 'Bueno', total: 25, operativo: true },
        { clave: 'Malo', etiqueta: 'Malo', total: 1, operativo: true },
        { clave: '@baja', etiqueta: 'Dado de baja', total: 1, operativo: false },
      ]);
      await api().get('/api/activos/estados').expect(401);
    }, LENTO);

    it('un estado de GLPI que indica baja excluye al equipo de los módulos (lista configurable)', async () => {
      const id = (await activoDe('Computer #16')).id;
      Object.assign(pc(16), { status: { id: 9, name: 'Dado de baja' }, date_mod: ahoraGlpi() });
      await sincronizar();

      // Aparece solo en el filtro: nadie tuvo que declararlo.
      const { body } = await api(tokens.auditor).get('/api/activos/estados').expect(200);
      expect(body).toContainEqual({
        clave: 'Dado de baja',
        etiqueta: 'Dado de baja',
        total: 1,
        operativo: false,
      });
      expect(await total('estado=Dado de baja')).toBe(1);
      expect(await total('operativos=true')).toBe(25);
      // Y el backend no admite operaciones nuevas sobre él.
      for (const [url, cuerpo] of operaciones(id)) {
        const res = await api(tokens.admin).post(url, cuerpo).expect(400);
        expect(res.body.message).toContain('no está operativo (su estado es "Dado de baja")');
      }
      // Un equipo en mal estado SÍ es operativo: es el que necesita mantenimiento.
      const malo = (await activoDe('Computer #5')).id;
      const creado = await api(tokens.analista).post(...operaciones(malo)[1]).expect(201);
      await api(tokens.admin)
        .post(`/api/mantenimientos/${creado.body.id}/anular`, { motivo: 'Creado solo para comprobar la regla de estados.' })
        .expect(200);

      // GLPI lo devuelve a Bueno: vuelve a ser operativo.
      Object.assign(pc(16), { status: { id: 3, name: 'Bueno' }, date_mod: ahoraGlpi() });
      await sincronizar();
      expect(await total('operativos=true')).toBe(26);
    }, LENTO);

    it('el backend rechaza operaciones NUEVAS sobre un equipo dado de baja (400)', async () => {
      for (const [url, cuerpo] of operaciones(activoId)) {
        const res = await api(tokens.admin).post(url, cuerpo).expect(400);
        expect(res.body.message).toContain('no está operativo (está en la papelera de GLPI)');
      }
      expect(await prisma.planRespaldo.count({ where: { activoId } })).toBe(1);
      expect(await prisma.mantenimiento.count({ where: { activoId } })).toBe(1);
      expect(await prisma.vulnerabilidad.count({ where: { activoId } })).toBe(1);
    }, LENTO);

    it('sus registros anteriores se conservan y se siguen consultando y gestionando', async () => {
      for (const [modulo, id] of [
        ['respaldos/planes', registros.respaldo],
        ['mantenimientos', registros.mantenimiento],
        ['vulnerabilidades', registros.vulnerabilidad],
      ] as const) {
        const detalle = await api(tokens.auditor).get(`/api/${modulo}/${id}`).expect(200);
        expect(detalle.body.activoId).toBe(activoId);
        const lista = await api(tokens.auditor).get(`/api/${modulo}?activoId=${activoId}`).expect(200);
        expect(lista.body.meta.total).toBe(1);
      }
      // Un mantenimiento ya programado se puede cerrar aunque el equipo ya no esté activo.
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${registros.mantenimiento}/cancelar`, { motivo: 'Equipo retirado' })
        .expect(200);
    }, LENTO);

    it('si GLPI lo restaura, vuelve a estar activo y admite operaciones', async () => {
      Object.assign(pc(7), { is_deleted: false, date_mod: ahoraGlpi() });
      const res = await sincronizar();
      expect(res.contadores).toMatchObject({ reactivados: 1 });
      expect(await total('estado=@baja')).toBe(0);
      await api(tokens.analista).post(...operaciones(activoId)[1]).expect(201);
    }, LENTO);

    it('baja manual desde la aplicación: también es dado de baja, conserva su ficha y no admite operaciones', async () => {
      const id = (await activoDe('Computer #9')).id;
      await api(tokens.analista).delete(`/api/activos/${id}`).expect(403);
      await api(tokens.admin).delete(`/api/activos/${id}`).expect(204);
      expect(await total('estado=@baja')).toBe(1);
      expect(await total('estado=Bueno')).toBe(25); // ya no cuenta como Bueno
      const ficha = await api(tokens.auditor).get(`/api/activos/${id}`).expect(200);
      expect(ficha.body.deletedAt).not.toBeNull();
      const res = await api(tokens.admin).post(...operaciones(id)[1]).expect(400);
      expect(res.body.message).toContain('fue dado de baja');
      // Y la sincronización no lo reactiva ni lo modifica.
      Object.assign(pc(9), { name: 'Renombrado en GLPI', date_mod: ahoraGlpi() });
      const sync = await sincronizar();
      expect(sync.cambios.find((c: { referencia: string }) => c.referencia === 'Computer #9'))
        .toMatchObject({ resultado: 'OMITIR', aplicado: false });
      expect((await prisma.activo.findUniqueOrThrow({ where: { id } })).nombre).toBe('Laptop 9');
    }, LENTO);
  });

  describe('12 · eliminación definitiva en GLPI (reconciliación completa)', () => {
    it('la incremental no la detecta; la completa la confirma y pasa el equipo a dado de baja sin borrar nada', async () => {
      const activo = await activoDe('Computer #12');
      glpi.elementos.Computer = glpi.elementos.Computer.filter((x) => x.id !== 12);

      const incremental = await sincronizar();
      expect(incremental.modo).toBe('INCREMENTAL');
      expect((await activoDe('Computer #12')).inactivoDesde).toBeNull();

      const completa = await sincronizar({ completa: true });
      expect(completa).toMatchObject({ modo: 'COMPLETA', estado: 'EXITOSA' });
      expect(completa.contadores.inactivados).toBe(1);
      expect(await activoDe('Computer #12')).toMatchObject({
        id: activo.id,
        motivoInactivo: 'AUSENTE_EN_GLPI',
        deletedAt: null,
      });
      expect(await prisma.bitacoraHistorial.count({ where: { activoId: activo.id } })).toBe(2);
      expect(
        (await api(tokens.auditor).get(`/api/activos/${activo.id}/bitacora`).expect(200)).body.data[0],
      ).toMatchObject({ accion: 'INACTIVAR', responsable: 'GLPI' });
    }, LENTO);

    it('el cuerpo de la petición se valida', async () => {
      await api(tokens.admin).post('/api/glpi/sincronizacion', { completa: 'si' }).expect(400);
    }, LENTO);
  });

  describe('10 y 15 · fallo de GLPI y recuperación', () => {
    it('si GLPI falla: nada cambia, el punto de control no avanza y queda un aviso de error', async () => {
      const exitosaAntes = (await api(tokens.auditor).get('/api/glpi/sincronizacion')).body.ultimaExitosa;
      const foto = JSON.stringify(await prisma.activo.findMany({ orderBy: { id: 'asc' } }));
      Object.assign(pc(15), { contact: 'cambio.pendiente', date_mod: ahoraGlpi() });
      glpi.rutasRotas = ['/v2/Assets/Computer'];

      const res = await sincronizar();
      expect(res.estado).toBe('FALLIDA');
      expect(res.puntoControlAvanzado).toBe(false);
      expect(res.errores[0]).toContain('GLPI respondió 500');
      expect(JSON.stringify(await prisma.activo.findMany({ orderBy: { id: 'asc' } }))).toBe(foto);

      const estado = (await api(tokens.auditor).get('/api/glpi/sincronizacion')).body;
      expect(estado.ultimaExitosa).toBe(exitosaAntes);
      expect(estado.ultima.estado).toBe('FALLIDA');
      expect(estado.enCurso).toBe(false); // el bloqueo se liberó

      // Repetir el fallo no acumula avisos idénticos.
      await sincronizar();
      expect(
        await prisma.notificacion.count({ where: { tipo: 'ERROR_SINCRONIZACION', leida: false } }),
      ).toBe(1);
    }, LENTO);

    it('al recuperarse GLPI, la siguiente ejecución aplica el cambio pendiente sin duplicar', async () => {
      glpi.rutasRotas = [];
      const res = await sincronizar();
      expect(res).toMatchObject({ estado: 'EXITOSA', puntoControlAvanzado: true });
      expect((await activoDe('Computer #15')).contacto).toBe('cambio.pendiente');
      expect(await prisma.activo.count()).toBe(27);
    }, LENTO);
  });

  describe('11 · ejecuciones simultáneas', () => {
    it('dos pulsaciones a la vez: una se ejecuta (200) y la otra se rechaza (409)', async () => {
      const antes = await prisma.sincronizacion.count();
      const respuestas = await Promise.all([
        api(tokens.analista).post('/api/glpi/sincronizacion'),
        api(tokens.admin).post('/api/glpi/sincronizacion'),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(respuestas.find((r) => r.status === 409)!.body.message).toContain('en curso');
      expect(await prisma.sincronizacion.count()).toBe(antes + 1);
    }, LENTO);

    it('mientras la automática escribe, el botón responde 409; un bloqueo abandonado caduca', async () => {
      const bloqueo = await prisma.sincronizacion.create({
        data: {
          origen: 'AUTOMATICA',
          modo: 'INCREMENTAL',
          tipos: 'Computer,NetworkEquipment',
          inicio: new Date(),
          enCurso: true,
        },
      });
      await api(tokens.admin).post('/api/glpi/sincronizacion').expect(409);
      expect((await api(tokens.auditor).get('/api/glpi/sincronizacion')).body.enCurso).toBe(true);

      // El proceso murió hace dos horas sin liberar el bloqueo.
      await prisma.sincronizacion.update({
        where: { id: bloqueo.id },
        data: { inicio: new Date(Date.now() - 2 * 3_600_000) },
      });
      await api(tokens.admin).post('/api/glpi/sincronizacion').expect(200);
      expect(
        await prisma.sincronizacion.findUniqueOrThrow({ where: { id: bloqueo.id } }),
      ).toMatchObject({ estado: 'FALLIDA', enCurso: null });
    }, LENTO);
  });

  describe('14 · ejecución automática', () => {
    it('el mismo motor, lanzado como AUTOMATICA, queda registrado y actualiza la última sincronización', async () => {
      const antes = (await api(tokens.auditor).get('/api/glpi/sincronizacion')).body.ultimaExitosa;
      await new Promise((r) => setTimeout(r, 20));
      const config: GlpiSyncConfig = {
        ...CONFIG_PRUEBA,
        origen: 'AUTOMATICA',
        databaseUrl: process.env.DATABASE_URL!,
      };
      const informe = await new Sincronizador(
        config,
        new GlpiClient({ ...config, fetch: falso.fetch }),
        new InventarioPrisma(prisma, new BitacoraService(prisma)),
        () => {},
      ).ejecutar();
      expect(informe.errores).toEqual([]);

      const estado = (await api(tokens.auditor).get('/api/glpi/sincronizacion')).body;
      expect(estado.ultima).toMatchObject({ origen: 'AUTOMATICA', estado: 'EXITOSA', solicitadaPor: null });
      expect(Date.parse(estado.ultimaExitosa)).toBeGreaterThan(Date.parse(antes));
    }, LENTO);
  });

  describe('documentación', () => {
    it('Swagger publica los endpoints nuevos y el filtro de situación', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(body.paths['/api/glpi/sincronizacion']).toHaveProperty('post');
      expect(body.paths['/api/glpi/sincronizacion']).toHaveProperty('get');
      expect(body.paths['/api/notificaciones/{id}/leida']).toHaveProperty('patch');
      const parametros = body.paths['/api/activos'].get.parameters.map((p: { name: string }) => p.name);
      expect(parametros).toEqual(expect.arrayContaining(['estado', 'operativos']));
      expect(parametros).not.toContain('situacion');
      expect(body.paths['/api/activos/estados']).toHaveProperty('get');
    }, LENTO);
  });
});
