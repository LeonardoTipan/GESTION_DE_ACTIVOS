/**
 * Vulnerabilidades en DOS fases (Detección y Remediación) contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo. Fechas de 2026 ya pasadas:
 * la detección y la remediación son históricas, como en la matriz.
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

const LENTO = 30_000;
const MOTIVO = 'Corrección registrada tras revisar el informe de vulnerabilidades.';
const DETECCION = '2026-01-25T14:00:00.000Z';
const REMEDIACION = '2026-04-27T15:00:00.000Z';
const CIERRE = {
  fechaRemediacion: REMEDIACION,
  evidencia: 'Informe de Mitigación de Amenazas y Vulnerabilidades 01',
  repositorioVerificable: 'Carpeta Compartida TICs/Vulnerabilidades/2026',
  observacion: 'Se actualizó el sistema operativo a la versión soportada.',
};

describe('Vulnerabilidades: Detección y Remediación (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let servidor: number;
  let aplicativo: number;
  let deBaja: number;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const hw = await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Servidores físicos', descripcion: '', claseMantenimiento: 'HARDWARE' } });
    const sw = await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Aplicativos', descripcion: '', claseMantenimiento: 'SOFTWARE' } });
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'Infraestructura', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    servidor = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-V6', nombre: 'SERVIDOR PARA VIRTUALIZACIÓN V6', categoriaId: hw.id } })).id;
    aplicativo = (await prisma.activo.create({ data: { ...base, codigo: 'AC-0001', nombre: 'SICET', categoriaId: sw.id } })).id;
    deBaja = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-OLD', nombre: 'Servidor retirado', categoriaId: hw.id, deletedAt: new Date() } })).id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const api = (token: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
    };
  };
  const DETECTADA = {
    fecha: DETECCION,
    descripcion: 'Sistema operativo desactualizado',
    nivelRiesgo: 'ALTO',
    responsable: 'ANALISTA 1',
  };
  const detectar = async (extra: Record<string, unknown> = {}) =>
    (await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA, ...extra }).expect(201)).body as { id: number; version: number };
  const trazas = async (id: number) =>
    (await api(tokens.auditor).get(`/api/trazas?entidad=VULNERABILIDAD&registroId=${id}`).expect(200)).body as {
      accion: string; version: number; responsable: string; motivo: string; cambios: { campo: string; antes: unknown; despues: unknown }[];
    }[];
  const activoAntes = () => prisma.activo.findUniqueOrThrow({ where: { id: servidor } });

  let id: number;

  describe('Fase 1 · Detección', () => {
    it('1, 2 y 5 · registra con los datos de la matriz, en ABIERTO y con la fecha de detección histórica', async () => {
      const res = await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA }).expect(201);
      expect(res.body).toMatchObject({
        activoId: servidor,
        activo: { codigo: 'SRV-V6', nombre: 'SERVIDOR PARA VIRTUALIZACIÓN V6' },
        fecha: DETECCION,
        descripcion: 'Sistema operativo desactualizado',
        nivelRiesgo: 'ALTO',
        responsable: 'ANALISTA 1',
        estado: 'ABIERTO',
        fechaRemediacion: null,
        evidencia: null,
        repositorioVerificable: null,
        observacion: null,
      });
      // La fecha de registro es automática y distinta de la detección.
      expect(res.body.createdAt).not.toBe(DETECCION);
      id = res.body.id;
    });

    it('la traza del alta guarda quién la registró y sus datos', async () => {
      const [alta] = await trazas(id);
      expect(alta).toMatchObject({ accion: 'REGISTRAR', responsable: 'analista.test', version: 0 });
      expect(alta.cambios).toEqual(expect.arrayContaining([
        expect.objectContaining({ campo: 'nivelRiesgo', antes: null, despues: 'ALTO' }),
        expect.objectContaining({ campo: 'estado', despues: 'ABIERTO' }),
      ]));
    });

    it('3 · rechaza un activo inexistente o dado de baja', async () => {
      await api(tokens.analista).post('/api/vulnerabilidades', { ...DETECTADA, activoId: 999999 }).expect(400);
      const baja = await api(tokens.analista).post('/api/vulnerabilidades', { ...DETECTADA, activoId: deBaja }).expect(400);
      expect(baja.body.message).toMatch(/dado de baja/);
    });

    it('4 · rechaza una criticidad no permitida y los datos obligatorios ausentes', async () => {
      await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA, nivelRiesgo: 'URGENTE' }).expect(400);
      const { responsable: _r, ...sinResponsable } = DETECTADA;
      await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...sinResponsable }).expect(400);
      await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA, fecha: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
      // El estado y los datos de remediación no se aceptan al detectar.
      await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA, estado: 'REMEDIADO' }).expect(400);
      await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA, fechaRemediacion: REMEDIACION }).expect(400);
    });

    it('la misma vulnerabilidad en varios activos: uno por activo, o ninguno', async () => {
      await api(tokens.analista).post('/api/vulnerabilidades/lote', { ...DETECTADA, activoIds: [aplicativo, deBaja] }).expect(400);
      expect(await prisma.vulnerabilidad.count({ where: { activoId: aplicativo } })).toBe(0);
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades/lote', { ...DETECTADA, descripcion: 'Certificado TLS caducado', nivelRiesgo: 'MEDIO', activoIds: [aplicativo] })
        .expect(201);
      expect(res.body).toHaveLength(1);
    });

    it('corregir la detección exige motivo; cambiar la criticidad queda en la auditoría', async () => {
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { nivelRiesgo: 'CRITICO' }).expect(400);
      const res = await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { nivelRiesgo: 'CRITICO', motivoCambio: MOTIVO }).expect(200);
      expect(res.body.nivelRiesgo).toBe('CRITICO');
      const [ultima] = await trazas(id);
      expect(ultima).toMatchObject({ accion: 'MODIFICAR', responsable: 'analista.test', motivo: MOTIVO });
      expect(ultima.cambios).toEqual([{ campo: 'nivelRiesgo', antes: 'ALTO', despues: 'CRITICO' }]);
      // Pasar a CRÍTICA genera un aviso en la misma transacción.
      expect(await prisma.notificacion.count({ where: { tipo: 'VULNERABILIDAD_CRITICA', activoId: servidor } })).toBe(1);
    });
  });

  describe('Fase 2 · Remediación', () => {
    let estadoActivo: Awaited<ReturnType<typeof activoAntes>>;

    beforeAll(async () => {
      estadoActivo = await activoAntes();
    });

    it('6 · iniciar: ABIERTO → EN_PROGRESO; no dos veces', async () => {
      const res = await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar`, { fechaInicio: '2026-02-01T13:00:00.000Z' }).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', tratamientoIniciadoEn: '2026-02-01T13:00:00.000Z', fechaRemediacion: null });
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar`).expect(409);
    });

    it('guardar una fecha de remediación NO la marca como remediada', async () => {
      const res = await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/remediacion`, { fechaRemediacion: REMEDIACION }).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', fechaRemediacion: REMEDIACION });
    });

    it('7 y 8 · no se remedia sin fecha, sin verificable o sin repositorio', async () => {
      const url = `/api/vulnerabilidades/${id}/remediar`;
      const { fechaRemediacion: _f, ...sinFecha } = CIERRE;
      const { evidencia: _e, ...sinVerificable } = CIERRE;
      const { repositorioVerificable: _r, ...sinRepositorio } = CIERRE;
      await api(tokens.analista).patch(url, sinFecha).expect(400);
      await api(tokens.analista).patch(url, sinVerificable).expect(400);
      await api(tokens.analista).patch(url, { ...sinRepositorio, repositorioVerificable: '' }).expect(400);
      const repo = await api(tokens.analista).patch(url, { ...CIERRE, repositorioVerificable: 'javascript:alert(1)' }).expect(400);
      expect(repo.body.message).toMatch(/http o https/);
      expect((await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id } })).estado).toBe('EN_PROGRESO');
    });

    it('11 · rechaza una fecha de remediación anterior a la detección o futura', async () => {
      const url = `/api/vulnerabilidades/${id}/remediar`;
      const antes = await api(tokens.analista).patch(url, { ...CIERRE, fechaRemediacion: '2026-01-20T10:00:00.000Z' }).expect(400);
      expect(antes.body.message).toMatch(/anterior a la fecha de detección/);
      await api(tokens.analista).patch(url, { ...CIERRE, fechaRemediacion: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
    });

    it('9 y 10 · remedia con la fecha histórica indicada (no la del servidor)', async () => {
      const res = await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/remediar`, CIERRE).expect(200);
      expect(res.body).toMatchObject({
        estado: 'REMEDIADO',
        fechaRemediacion: REMEDIACION,
        evidencia: CIERRE.evidencia,
        repositorioVerificable: CIERRE.repositorioVerificable,
        observacion: CIERRE.observacion,
        cerradaPor: 'analista.test',
      });
      // Se registró hoy, pero la fecha de remediación es la real (27/04/2026).
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(new Date(REMEDIACION).getTime());
    });

    it('una remediada no admite cambios de detección ni un segundo cierre', async () => {
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { descripcion: 'Otra', motivoCambio: MOTIVO }).expect(409);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/remediar`, CIERRE).expect(409);
    });

    it('12 · la auditoría registra estado, criticidad y la fecha de remediación con el usuario', async () => {
      const t = await trazas(id);
      const campos = t.flatMap((x) => x.cambios.map((c) => c.campo));
      expect(campos).toEqual(expect.arrayContaining(['estado', 'nivelRiesgo', 'fechaRemediacion', 'evidencia', 'repositorioVerificable']));
      const cierre = t.find((x) => x.cambios.some((c) => c.campo === 'estado' && c.despues === 'REMEDIADO'))!;
      expect(cierre).toMatchObject({ accion: 'MODIFICAR', responsable: 'analista.test' });
    });

    it('13 · transaccional: lo rechazado no deja traza ni sube la versión; la versión cuadra con las trazas', async () => {
      const antes = await trazas(id);
      const v = await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id } });
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar`).expect(409);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/remediar`, CIERRE).expect(409);
      expect(await trazas(id)).toHaveLength(antes.length);
      expect((await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id } })).version).toBe(v.version);
      expect(v.version).toBe(1 + antes.filter((x) => x.accion === 'MODIFICAR').length);
    });

    it('corregir una remediación cerrada: el analista no (403); el admin con motivo', async () => {
      const url = `/api/vulnerabilidades/${id}/remediacion`;
      await api(tokens.analista).patch(url, { observacion: 'Otra', motivoCambio: MOTIVO }).expect(403);
      await api(tokens.admin).patch(url, { observacion: 'Otra' }).expect(400);
      await api(tokens.admin).patch(url, { evidencia: '', motivoCambio: MOTIVO }).expect(400); // no puede quedar sin evidencia
      const res = await api(tokens.admin).patch(url, { observacion: 'Actualización y reinicio validados por el área.', motivoCambio: MOTIVO }).expect(200);
      expect(res.body).toMatchObject({ estado: 'REMEDIADO', observacion: 'Actualización y reinicio validados por el área.' });
    });

    it('14 · reabrir exige motivo, vacía la fecha vigente y conserva el historial', async () => {
      const antes = await trazas(id);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/reabrir`, { motivo: 'corto' }).expect(400);
      const res = await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/reabrir`, { motivo: 'El escaneo de mayo vuelve a detectar la versión vulnerable.' })
        .expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', fechaRemediacion: null, evidencia: CIERRE.evidencia });
      const despues = await trazas(id);
      expect(despues).toHaveLength(antes.length + 1);
      const [reapertura] = despues;
      expect(reapertura.cambios).toEqual(expect.arrayContaining([
        expect.objectContaining({ campo: 'estado', antes: 'REMEDIADO', despues: 'EN_PROGRESO' }),
        expect.objectContaining({ campo: 'fechaRemediacion', antes: REMEDIACION, despues: null }),
      ]));
      expect(await prisma.notificacion.count({ where: { tipo: 'VULNERABILIDAD_REABIERTA' } })).toBe(1);
      // Se vuelve a remediar con una nueva fecha real.
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/remediar`, { ...CIERRE, fechaRemediacion: '2026-05-20T15:00:00.000Z' }).expect(200);
    });

    it('15 · el estado de la vulnerabilidad no altera el activo de GLPI', async () => {
      const despues = await activoAntes();
      expect({ estado: despues.estado, deletedAt: despues.deletedAt, inactivoDesde: despues.inactivoDesde, updatedAt: despues.updatedAt }).toEqual({
        estado: estadoActivo.estado,
        deletedAt: estadoActivo.deletedAt,
        inactivoDesde: estadoActivo.inactivoDesde,
        updatedAt: estadoActivo.updatedAt,
      });
    });

    it('un activo que sale de GLPI conserva sus vulnerabilidades, pero no admite nuevas', async () => {
      await prisma.activo.update({ where: { id: servidor }, data: { inactivoDesde: new Date(), motivoInactivo: 'PAPELERA_GLPI' } });
      await api(tokens.auditor).get(`/api/vulnerabilidades/${id}`).expect(200);
      const res = await api(tokens.analista).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA }).expect(400);
      expect(res.body.message).toMatch(/papelera de GLPI/);
      await prisma.activo.update({ where: { id: servidor }, data: { inactivoDesde: null, motivoInactivo: null } });
    });
  });

  describe('16 · permisos', () => {
    it('el auditor consulta pero no detecta, remedia ni reabre (403); sin token, 401', async () => {
      await api(tokens.auditor).get('/api/vulnerabilidades').expect(200);
      await api(tokens.auditor).get(`/api/vulnerabilidades/${id}`).expect(200);
      await api(tokens.auditor).post('/api/vulnerabilidades', { activoId: servidor, ...DETECTADA }).expect(403);
      await api(tokens.auditor).patch(`/api/vulnerabilidades/${id}/iniciar`).expect(403);
      await api(tokens.auditor).patch(`/api/vulnerabilidades/${id}/remediar`, CIERRE).expect(403);
      await api(tokens.auditor).patch(`/api/vulnerabilidades/${id}/reabrir`, { motivo: MOTIVO }).expect(403);
      await api(tokens.analista).post(`/api/vulnerabilidades/${id}/anular`, { motivo: MOTIVO }).expect(403);
      await request(app.getHttpServer()).get('/api/vulnerabilidades').expect(401);
    });
  });

  describe('17 · filtros y paginación', () => {
    beforeAll(async () => {
      await detectar({ descripcion: 'Puerto SMB expuesto', nivelRiesgo: 'BAJO', fecha: '2026-03-10T14:00:00.000Z', responsable: 'ANALISTA 2' });
      await detectar({ descripcion: 'Contraseña por defecto en el iLO', nivelRiesgo: 'MEDIO', fecha: '2026-06-15T14:00:00.000Z' });
    }, LENTO);

    it('por activo, criticidad, responsable, estado y rango de fechas de detección', async () => {
      const total = async (q: string) => (await api(tokens.auditor).get(`/api/vulnerabilidades?${q}`).expect(200)).body.meta.total;
      expect(await total(`activoId=${servidor}`)).toBe(3);
      expect(await total(`activoId=${aplicativo}`)).toBe(1);
      expect(await total('nivelRiesgo=CRITICO')).toBe(1);
      expect(await total('responsable=ANALISTA 2')).toBe(1);
      expect(await total('estado=REMEDIADO')).toBe(1);
      expect(await total('estado=ABIERTO')).toBe(3);
      expect(await total(`desde=${encodeURIComponent('2026-03-01T00:00:00.000Z')}&hasta=${encodeURIComponent('2026-06-30T23:59:59.000Z')}`)).toBe(2);
      await api(tokens.auditor).get('/api/vulnerabilidades?nivelRiesgo=URGENTE').expect(400);
      await api(tokens.auditor).get('/api/vulnerabilidades?estado=MITIGADA').expect(400);
    });

    it('paginación: páginas sin repetidos que cubren el total, con límite máximo', async () => {
      const paginas = await Promise.all([1, 2].map((p) => api(tokens.auditor).get(`/api/vulnerabilidades?limit=2&page=${p}`).expect(200)));
      expect(paginas[0].body.meta).toEqual({ total: 4, page: 1, limit: 2, totalPages: 2 });
      const ids = paginas.flatMap((p) => p.body.data.map((v: { id: number }) => v.id));
      expect(new Set(ids).size).toBe(4);
      await api(tokens.auditor).get('/api/vulnerabilidades?limit=500').expect(400);
    });
  });

  it('agenda: solo las capas de Detección y Remediación', async () => {
    const q = `desde=${encodeURIComponent('2026-01-01T00:00:00.000Z')}&hasta=${encodeURIComponent('2026-12-31T00:00:00.000Z')}`;
    const todo = (await api(tokens.auditor).get(`/api/vulnerabilidades/agenda?${q}`).expect(200)).body as { clave: string; capa: number; inicio: string }[];
    expect(todo.every((e) => e.capa === 1 || e.capa === 2)).toBe(true);
    expect(todo.find((e) => e.clave === `v2r-${id}`)?.inicio).toBe('2026-05-20T15:00:00.000Z');
    expect((await api(tokens.auditor).get(`/api/vulnerabilidades/agenda?${q}&capa=3`).expect(200)).body).toEqual([]);
  });

  it('Swagger documenta las rutas de las dos fases y ya no las de verificación', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const rutas = Object.keys(res.body.paths);
    expect(rutas).toEqual(expect.arrayContaining([
      '/api/vulnerabilidades',
      '/api/vulnerabilidades/lote',
      '/api/vulnerabilidades/{id}',
      '/api/vulnerabilidades/{id}/iniciar',
      '/api/vulnerabilidades/{id}/remediacion',
      '/api/vulnerabilidades/{id}/remediar',
      '/api/vulnerabilidades/{id}/reabrir',
    ]));
    expect(rutas.some((r) => /vulnerabilidades.*(verificaci|acciones|aceptar-riesgo|confirmar|evaluar)/.test(r))).toBe(false);
  });
});
