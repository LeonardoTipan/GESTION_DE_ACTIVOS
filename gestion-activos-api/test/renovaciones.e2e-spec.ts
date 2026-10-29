/**
 * Renovaciones en DOS fases (Planificación y Ejecución y cierre) contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo. Las fechas son DÍAS.
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
const MOTIVO = 'Corrección registrada tras revisar el contrato de renovación.';
const D = (dia: string) => `${dia}T00:00:00.000Z`;
/** Hoy ± n días, en la hora de Guayaquil, como 'AAAA-MM-DD'. */
const diaMas = (n: number) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
  return new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
};
const CIERRE = {
  fechaRenovacion: '2026-04-27',
  nuevaFechaCaducidad: '2029-04-27',
  evidencia: 'Informe de Satisfacción del Contrato de Renovación',
  repositorioVerificable: 'Carpeta Compartida TICs/Interno',
  descripcion: 'El servidor fue migrado a la nube con el proveedor XXXXX.',
};

describe('Renovaciones: Planificación y Ejecución y cierre (e2e)', () => {
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
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    servidor = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-V6', nombre: 'SERVIDOR PARA VIRTUALIZACIÓN V6', categoriaId: hw.id } })).id;
    aplicativo = (await prisma.activo.create({ data: { ...base, codigo: 'AC-0001', nombre: 'SICET', categoriaId: sw.id } })).id;
    deBaja = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-OLD', nombre: 'Retirado', categoriaId: hw.id, deletedAt: new Date() } })).id;
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
  const PLAN = {
    activoId: 0,
    tipo: 'CONTRATO_SERVICIO',
    responsable: 'ANALISTA 1',
    fechaPlanificada: '2026-01-25',
    fechaCaducidadActual: '2026-04-27',
  };
  const planificar = async (extra: Record<string, unknown>) =>
    (await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor, ...extra }).expect(201)).body as { id: number };
  const trazas = async (id: number) =>
    (await api(tokens.auditor).get(`/api/trazas?entidad=RENOVACION&registroId=${id}`).expect(200)).body as {
      accion: string; responsable: string; motivo: string; cambios: { campo: string; antes: unknown; despues: unknown }[];
    }[];

  let id: number;
  let activoAntes: Awaited<ReturnType<PrismaService['activo']['findUniqueOrThrow']>>;

  describe('Fase 1 · Planificación', () => {
    it('1 y 2 · planifica en ABIERTO con la fecha de caducidad actual; queda la traza del alta', async () => {
      activoAntes = await prisma.activo.findUniqueOrThrow({ where: { id: servidor } });
      const res = await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor }).expect(201);
      expect(res.body).toMatchObject({
        activo: { codigo: 'SRV-V6', nombre: 'SERVIDOR PARA VIRTUALIZACIÓN V6' },
        tipo: 'CONTRATO_SERVICIO',
        responsable: 'ANALISTA 1',
        estado: 'ABIERTO',
        fechaPlanificada: D('2026-01-25'),
        fechaCaducidadActual: D('2026-04-27'),
        fechaRenovacion: null,
        nuevaFechaCaducidad: null,
        // Proceso ABIERTO, pero el contrato ya caducó el 27/04/2026: son cosas distintas.
        vigencia: 'CADUCADA',
        venceEl: D('2026-04-27'),
        renovacionAnterior: null,
      });
      id = res.body.id;
      const [alta] = await trazas(id);
      expect(alta).toMatchObject({ accion: 'REGISTRAR', responsable: 'analista.test' });
      expect(alta.cambios).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'fechaCaducidadActual', despues: D('2026-04-27') })]));
    });

    it('la caducidad actual es obligatoria salvo «sin caducidad» justificado (no se inventan fechas)', async () => {
      const { fechaCaducidadActual: _f, ...sinFecha } = PLAN;
      const sin = await api(tokens.analista).post('/api/renovaciones', { ...sinFecha, activoId: aplicativo, tipo: 'LICENCIA' }).expect(400);
      expect(sin.body.message).toMatch(/fecha de caducidad actual/);
      await api(tokens.analista).post('/api/renovaciones', { ...sinFecha, activoId: aplicativo, tipo: 'LICENCIA', sinCaducidadActual: true }).expect(400);
      const ok = await api(tokens.analista)
        .post('/api/renovaciones', { ...sinFecha, activoId: aplicativo, tipo: 'LICENCIA', sinCaducidadActual: true, observacion: 'Licencia perpetua: el fabricante no fija caducidad.' })
        .expect(201);
      expect(ok.body).toMatchObject({ fechaCaducidadActual: null, sinCaducidadActual: true, vigencia: 'SIN_CADUCIDAD' });
    });

    it('rechaza activo inexistente o dado de baja, tipo inválido y fechas mal formadas', async () => {
      await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: 999999 }).expect(400);
      const baja = await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: deBaja }).expect(400);
      expect(baja.body.message).toMatch(/dado de baja/);
      await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor, tipo: 'DOMINIO' }).expect(400);
      await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor, tipo: 'GARANTIA', fechaPlanificada: '2026-02-30' }).expect(400);
      await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor, tipo: 'GARANTIA', fechaPlanificada: '2026-01-25T10:00:00Z' }).expect(400);
      // El estado y los datos de la ejecución no se aceptan al planificar.
      await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor, tipo: 'GARANTIA', estado: 'CERRADO' }).expect(400);
    });

    it('un elemento (activo y tipo) solo tiene una renovación pendiente', async () => {
      const res = await api(tokens.analista).post('/api/renovaciones', { ...PLAN, activoId: servidor }).expect(409);
      expect(res.body.message).toContain(`la ${id}`);
    });

    it('corregir la planificación exige motivo y conserva la caducidad anterior en la auditoría', async () => {
      await api(tokens.analista).patch(`/api/renovaciones/${id}`, { fechaCaducidadActual: '2026-04-28' }).expect(400);
      await api(tokens.analista).patch(`/api/renovaciones/${id}`, { fechaCaducidadActual: '2026-04-28', motivoCambio: MOTIVO }).expect(200);
      await api(tokens.analista).patch(`/api/renovaciones/${id}`, { fechaCaducidadActual: '2026-04-27', motivoCambio: MOTIVO }).expect(200);
      const [ultima] = await trazas(id);
      expect(ultima.cambios).toEqual([{ campo: 'fechaCaducidadActual', antes: D('2026-04-28'), despues: D('2026-04-27') }]);
    });
  });

  describe('Fase 2 · Ejecución y cierre', () => {
    it('11 · iniciar: ABIERTO → EN_PROGRESO; no dos veces', async () => {
      await api(tokens.analista).patch(`/api/renovaciones/${id}/iniciar`).expect(200);
      await api(tokens.analista).patch(`/api/renovaciones/${id}/iniciar`).expect(409);
    });

    it('6 y 7 · no cierra sin los datos obligatorios; el mensaje dice qué falta; nada se completa solo', async () => {
      const vacio = await api(tokens.analista).patch(`/api/renovaciones/${id}/cerrar`, {}).expect(400);
      expect(vacio.body.message).toMatch(/falta la fecha real de renovación, la nueva fecha de caducidad.*el verificable, el repositorio del verificable/);
      const { evidencia: _e, ...sinEvidencia } = CIERRE;
      const res = await api(tokens.analista).patch(`/api/renovaciones/${id}/cerrar`, sinEvidencia).expect(400);
      expect(res.body.message).toMatch(/falta el verificable/);
      const v = await prisma.renovacion.findUniqueOrThrow({ where: { id } });
      expect(v).toMatchObject({ estado: 'EN_PROGRESO', fechaRenovacion: null, nuevaFechaCaducidad: null });
    });

    it('guardar la fecha real no cierra la renovación', async () => {
      const res = await api(tokens.analista).patch(`/api/renovaciones/${id}/ejecucion`, { fechaRenovacion: '2026-04-27' }).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', fechaRenovacion: D('2026-04-27') });
    });

    it('5 · rechaza fechas incoherentes', async () => {
      const url = `/api/renovaciones/${id}/cerrar`;
      const futura = await api(tokens.analista).patch(url, { ...CIERRE, fechaRenovacion: diaMas(1) }).expect(400);
      expect(futura.body.message).toMatch(/futura/);
      const antes = await api(tokens.analista).patch(url, { ...CIERRE, nuevaFechaCaducidad: '2026-04-27' }).expect(400);
      expect(antes.body.message).toMatch(/posterior a la fecha real de renovación/);
      const noAmplia = await api(tokens.analista).patch(url, { ...CIERRE, fechaRenovacion: '2026-03-01', nuevaFechaCaducidad: '2026-04-20' }).expect(400);
      expect(noAmplia.body.message).toMatch(/posterior a la caducidad actual/);
      await api(tokens.analista).patch(url, { ...CIERRE, nuevaSinCaducidad: true }).expect(400); // sin caducidad y fecha a la vez
      await api(tokens.analista).patch(url, { ...CIERRE, repositorioVerificable: 'javascript:alert(1)' }).expect(400);
    });

    it('3 y 4 · cierra con la fecha real histórica y la nueva caducidad; la caducidad actual se conserva', async () => {
      const res = await api(tokens.analista).patch(`/api/renovaciones/${id}/cerrar`, CIERRE).expect(200);
      expect(res.body).toMatchObject({
        estado: 'CERRADO',
        fechaCaducidadActual: D('2026-04-27'),
        fechaRenovacion: D('2026-04-27'),
        nuevaFechaCaducidad: D('2029-04-27'),
        evidencia: CIERRE.evidencia,
        repositorioVerificable: CIERRE.repositorioVerificable,
        descripcion: CIERRE.descripcion,
        cerradaPor: 'analista.test',
        // Tras cerrar rige la nueva caducidad.
        vigencia: 'VIGENTE',
        venceEl: D('2029-04-27'),
      });
      await api(tokens.analista).patch(`/api/renovaciones/${id}/cerrar`, CIERRE).expect(409);
      await api(tokens.analista).patch(`/api/renovaciones/${id}`, { responsable: 'Otro', motivoCambio: MOTIVO }).expect(409);
    });

    it('9 · la auditoría conserva las fechas anteriores y nuevas, con el usuario', async () => {
      const t = await trazas(id);
      const cierre = t.find((x) => x.cambios.some((c) => c.campo === 'estado' && c.despues === 'CERRADO'))!;
      expect(cierre).toMatchObject({ accion: 'MODIFICAR', responsable: 'analista.test' });
      expect(cierre.cambios).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nuevaFechaCaducidad', antes: null, despues: D('2029-04-27') })]));
      // La caducidad actual nunca se sobrescribe al cerrar.
      expect(cierre.cambios.some((c) => c.campo === 'fechaCaducidadActual')).toBe(false);
    });

    it('11 · corregir una cerrada: el analista no; el admin con motivo; reabrir vacía las fechas vigentes', async () => {
      await api(tokens.analista).patch(`/api/renovaciones/${id}/ejecucion`, { observacion: 'X', motivoCambio: MOTIVO }).expect(403);
      await api(tokens.admin).patch(`/api/renovaciones/${id}/ejecucion`, { observacion: 'X' }).expect(400);
      await api(tokens.admin).patch(`/api/renovaciones/${id}/ejecucion`, { evidencia: '', motivoCambio: MOTIVO }).expect(400);
      await api(tokens.admin).patch(`/api/renovaciones/${id}/ejecucion`, { observacion: 'Factura n.º 123 adjunta en la carpeta.', motivoCambio: MOTIVO }).expect(200);

      const reabierta = await api(tokens.analista)
        .patch(`/api/renovaciones/${id}/reabrir`, { motivo: 'El proveedor anuló la factura: la renovación no se completó.' })
        .expect(200);
      expect(reabierta.body).toMatchObject({ estado: 'EN_PROGRESO', fechaRenovacion: null, nuevaFechaCaducidad: null, fechaCaducidadActual: D('2026-04-27') });
      const [t] = await trazas(id);
      expect(t.cambios).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nuevaFechaCaducidad', antes: D('2029-04-27'), despues: null })]));
      await api(tokens.analista).patch(`/api/renovaciones/${id}/cerrar`, CIERRE).expect(200);
    });

    it('renovar otra vez: la nueva enlaza con la anterior, que queda sustituida y conserva sus fechas', async () => {
      const segunda = await planificar({ fechaPlanificada: '2029-03-01', fechaCaducidadActual: '2029-04-27' });
      const nueva = await api(tokens.auditor).get(`/api/renovaciones/${segunda.id}`).expect(200);
      expect(nueva.body.renovacionAnterior).toMatchObject({ id, nuevaFechaCaducidad: D('2029-04-27') });
      const anterior = await api(tokens.auditor).get(`/api/renovaciones/${id}`).expect(200);
      expect(anterior.body).toMatchObject({ vigencia: 'SUSTITUIDA', sustituidaPor: segunda.id, fechaRenovacion: D('2026-04-27'), nuevaFechaCaducidad: D('2029-04-27') });
      const res = await api(tokens.analista).patch(`/api/renovaciones/${id}/reabrir`, { motivo: MOTIVO }).expect(409);
      expect(res.body.message).toMatch(/sustituida/);
    });

    it('10 · el activo de GLPI no se modifica', async () => {
      const despues = await prisma.activo.findUniqueOrThrow({ where: { id: servidor } });
      expect(despues).toEqual(activoAntes);
    });
  });

  describe('8 · alertas de caducidad, filtros y paginación', () => {
    beforeAll(async () => {
      await planificar({ tipo: 'GARANTIA', fechaCaducidadActual: diaMas(10), responsable: 'ANALISTA 2' });
      await planificar({ tipo: 'CERTIFICADO', fechaCaducidadActual: diaMas(200) });
      await planificar({ activoId: aplicativo, tipo: 'CERTIFICADO', fechaCaducidadActual: diaMas(-5) });
    }, LENTO);

    it('resumen por vigencia (sin contar las sustituidas) con el umbral configurado', async () => {
      const { body } = await api(tokens.auditor).get('/api/renovaciones/resumen').expect(200);
      // Vigentes: el contrato que rige (2029) y el certificado a 200 días. Sin caducidad: la licencia perpetua.
      expect(body).toEqual({ diasAviso: 30, vigentes: 2, proximas: 1, caducadas: 1, sinCaducidad: 1 });
    });

    it('filtros por vigencia, rango de caducidad, sistema, tipo, estado y responsable', async () => {
      const total = async (q: string) => (await api(tokens.auditor).get(`/api/renovaciones?${q}`).expect(200)).body.meta.total;
      expect(await total('vigencia=PROXIMA')).toBe(1);
      expect(await total('vigencia=CADUCADA')).toBe(1);
      expect(await total('vigencia=SUSTITUIDA')).toBe(1);
      expect(await total(`caducaDesde=${diaMas(0)}&caducaHasta=${diaMas(30)}`)).toBe(1);
      expect(await total(`activoId=${aplicativo}`)).toBe(2);
      expect(await total('tipo=CERTIFICADO')).toBe(2);
      expect(await total('estado=CERRADO')).toBe(1);
      expect(await total('responsable=ANALISTA 2')).toBe(1);
      expect(await total('pendientes=true')).toBe(5);
      expect(await total('pendientes=false')).toBe(1);
      await api(tokens.auditor).get('/api/renovaciones?vigencia=ROJA').expect(400);
      await api(tokens.auditor).get('/api/renovaciones?caducaDesde=ayer').expect(400);
    });

    it('próximas caducidades: lo caducado y lo que vence pronto, por urgencia', async () => {
      const { body } = await api(tokens.auditor).get('/api/renovaciones/caducidades').expect(200);
      expect(body.map((r: { vigencia: string }) => r.vigencia)).toEqual(['CADUCADA', 'PROXIMA']);
      expect(body[1]).toMatchObject({ tipo: 'GARANTIA', diasRestantes: 10 });
    });

    it('paginación: sin repetidos y con límite máximo', async () => {
      const paginas = await Promise.all([1, 2, 3].map((p) => api(tokens.auditor).get(`/api/renovaciones?limit=2&page=${p}`).expect(200)));
      expect(paginas[0].body.meta).toMatchObject({ total: 6, totalPages: 3 });
      expect(new Set(paginas.flatMap((p) => p.body.data.map((r: { id: number }) => r.id))).size).toBe(6);
      await api(tokens.auditor).get('/api/renovaciones?limit=500').expect(400);
    });
  });

  describe('11 · permisos', () => {
    it('el auditor consulta pero no planifica, ejecuta, cierra ni reabre (403); sin token, 401', async () => {
      await api(tokens.auditor).get('/api/renovaciones').expect(200);
      await api(tokens.auditor).post('/api/renovaciones', { ...PLAN, activoId: servidor, tipo: 'OTRO' }).expect(403);
      await api(tokens.auditor).patch(`/api/renovaciones/${id}/iniciar`).expect(403);
      await api(tokens.auditor).patch(`/api/renovaciones/${id}/cerrar`, CIERRE).expect(403);
      await api(tokens.auditor).patch(`/api/renovaciones/${id}/reabrir`, { motivo: MOTIVO }).expect(403);
      await api(tokens.analista).post(`/api/renovaciones/${id}/anular`, { motivo: MOTIVO }).expect(403);
      await request(app.getHttpServer()).get('/api/renovaciones').expect(401);
    });
  });

  it('Swagger documenta las rutas del módulo', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining([
      '/api/renovaciones',
      '/api/renovaciones/resumen',
      '/api/renovaciones/caducidades',
      '/api/renovaciones/{id}',
      '/api/renovaciones/{id}/iniciar',
      '/api/renovaciones/{id}/ejecucion',
      '/api/renovaciones/{id}/cerrar',
      '/api/renovaciones/{id}/reabrir',
    ]));
  });
});
