/**
 * Fase 2 (registro/ejecución y cierre) de Protección de Endpoints y de Evaluación de Sistemas
 * Productivos, y la bitácora de Evaluación, contra MySQL (gestion_activos_test) y el Keycloak
 * de desarrollo. Los registros de partida se crean por la API (fase 1), no a mano.
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

const LENTO = 30_000;

describe('Protección de Endpoints y Evaluación de Sistemas Productivos · fase 2 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = {} as Record<'sistema' | 'otroSistema' | 'tercerSistema', number>;

  const api = (token?: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
    };
  };
  const trazas = async (entidad: string, id: number) =>
    (await api(tokens.auditor).get(`/api/trazas?entidad=${entidad}&registroId=${id}`).expect(200)).body as Array<{
      accion: string;
      motivo: string;
      responsable: string;
      cambios: Array<{ campo: string; antes: unknown; despues: unknown }>;
    }>;
  const [anioHoy, mesHoy] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  const mesAtras = (n: number) => {
    const t = anioHoy * 12 + (mesHoy - 1) - n;
    return { anio: Math.floor(t / 12), mes: (t % 12) + 1 };
  };
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const EVIDENCIA = { evidencia: 'Inventario de equipos.xlsx', repositorioVerificable: 'Carpeta Compartida TICs/Antivirus' };
  const INFORME = { evidencia: 'Informe de pruebas de seguridad.pdf', repositorioVerificable: 'https://intranet.local/seguridad/informes' };

  const abrirPeriodo = async (n: number) =>
    (await api(tokens.analista).post('/api/proteccion-endpoints/periodos', { ...mesAtras(n), responsable: 'Soporte TIC' }).expect(201)).body.id as number;
  const planificar = async (activoId: number, dias: number) =>
    (
      await api(tokens.analista)
        .post('/api/evaluaciones-sistemas', {
          activoId,
          fechaProgramadaProduccion: enDias(dias),
          responsable: 'Seguridad TIC',
          descripcion: 'Versión 2.1: pruebas de autenticación y autorización.',
        })
        .expect(201)
    ).body.id as number;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const aplicativos = (await prisma.categoria.create({ data: { nombre: 'Aplicativos', descripcion: '', claseMantenimiento: 'SOFTWARE', aplicaEvaluacion: true } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    const activo = async (codigo: string) => (await prisma.activo.create({ data: { ...base, codigo, nombre: codigo, categoriaId: aplicativos } })).id;
    ids.sistema = await activo('APL-NOMINA');
    ids.otroSistema = await activo('APL-PORTAL');
    ids.tercerSistema = await activo('APL-TRAMITES');
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  describe('Protección de Endpoints · registro y cierre del mes', () => {
    it('guardar avance: deja el período EN_PROGRESO, calcula la cobertura y audita valor anterior y nuevo', async () => {
      const id = await abrirPeriodo(1);
      const res = await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 26, equiposConAntivirus: 25 }).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', totalActivos: 26, equiposConAntivirus: 25, cobertura: 96.2, equiposSinAntivirus: 1, cerradoPor: null, version: 2 });
      const t = await trazas('PERIODO_ENDPOINT', id);
      const modificacion = t.find((x) => x.accion === 'MODIFICAR')!;
      expect(modificacion.responsable).toBe('analista.test');
      expect(modificacion.cambios).toEqual(
        expect.arrayContaining([
          { campo: 'totalActivos', antes: null, despues: 26 },
          { campo: 'estado', antes: 'ABIERTO', despues: 'EN_PROGRESO' },
        ]),
      );
      // Persiste: la ficha y el listado devuelven lo guardado.
      expect((await api(tokens.auditor).get(`/api/proteccion-endpoints/periodos/${id}`).expect(200)).body.cobertura).toBe(96.2);
      const lista = await api(tokens.auditor).get('/api/proteccion-endpoints/periodos?estado=EN_PROGRESO').expect(200);
      expect(lista.body.data.map((p: { id: number }) => p.id)).toContain(id);
    }, LENTO);

    it('coherencia: más equipos con antivirus que el total (también combinando lo ya guardado), total 0 o negativos → 400', async () => {
      const id = await abrirPeriodo(2);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 10, equiposConAntivirus: 11 }).expect(400);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 10 }).expect(200);
      const res = await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { equiposConAntivirus: 12 }).expect(400);
      expect(res.body.message).toContain('no pueden superar el total de activos (10)');
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 0 }).expect(400);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { equiposConAntivirus: -1 }).expect(400);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { repositorioVerificable: 'javascript:alert(1)' }).expect(400);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { cobertura: 99 }).expect(400); // calculada: no se escribe
    }, LENTO);

    it('cerrar exige los dos totales, el verificable y el repositorio; dice qué falta; el total digitado no tiene que coincidir con la aplicación', async () => {
      const id = await abrirPeriodo(3);
      const falta = await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, { totalActivos: 27 }).expect(400);
      expect(falta.body.message).toBe(
        'Para cerrar el período falta: los equipos con antivirus activo, el verificable (inventario de equipos), el repositorio del verificable.',
      );
      // Nada cambió con el intento fallido.
      expect((await api(tokens.auditor).get(`/api/proteccion-endpoints/periodos/${id}`).expect(200)).body).toMatchObject({ estado: 'ABIERTO', totalActivos: null });
      // Cerrar directamente desde ABIERTO; 27 equipos aunque la aplicación no tenga ninguno: prima el levantamiento real.
      const res = await api(tokens.analista)
        .patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, { totalActivos: 27, equiposConAntivirus: 27, ...EVIDENCIA, observacion: 'Inventario completo del mes.' })
        .expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', cobertura: 100, cerradoPor: 'analista.test', ...EVIDENCIA });
      expect((await trazas('PERIODO_ENDPOINT', id)).some((t) => t.motivo === 'Período registrado y cerrado.')).toBe(true);
      // Cerrado: ni se guarda avance ni se vuelve a cerrar.
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 30 }).expect(409);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, {}).expect(409);
    }, LENTO);

    it('reabrir: solo admin y con motivo (≥ 20); conserva los datos; vuelve a EN_PROGRESO y cuenta como pendiente', async () => {
      const id = await abrirPeriodo(4);
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, { totalActivos: 20, equiposConAntivirus: 18, ...EVIDENCIA }).expect(200);
      const antes = (await api(tokens.auditor).get('/api/dashboard/pendientes').expect(200)).body.endpoints;
      const motivo = { motivo: 'El inventario tenía equipos duplicados: hay que corregir el total.' };
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/reabrir`, motivo).expect(403);
      await api(tokens.auditor).patch(`/api/proteccion-endpoints/periodos/${id}/reabrir`, motivo).expect(403);
      await api(tokens.admin).patch(`/api/proteccion-endpoints/periodos/${id}/reabrir`, { motivo: 'corto' }).expect(400);
      const res = await api(tokens.admin).patch(`/api/proteccion-endpoints/periodos/${id}/reabrir`, motivo).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', totalActivos: 20, equiposConAntivirus: 18, cerradoPor: null });
      expect((await trazas('PERIODO_ENDPOINT', id)).some((t) => t.motivo === `Reabierto: ${motivo.motivo}` && t.responsable === 'admin.test')).toBe(true);
      expect((await api(tokens.auditor).get('/api/dashboard/pendientes').expect(200)).body.endpoints).toBe(antes + 1);
      // Reabrir lo que no está cerrado: 409.
      await api(tokens.admin).patch(`/api/proteccion-endpoints/periodos/${id}/reabrir`, motivo).expect(409);
      // Y se corrige y se vuelve a cerrar.
      await api(tokens.analista).patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, { totalActivos: 19 }).expect(200);
    }, LENTO);

    it('permisos: el auditor consulta pero no registra ni cierra (403); sin sesión 401; período inexistente 404; anulado 409', async () => {
      const id = await abrirPeriodo(5);
      await api(tokens.auditor).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 5 }).expect(403);
      await api(tokens.auditor).patch(`/api/proteccion-endpoints/periodos/${id}/cerrar`, {}).expect(403);
      await api().patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 5 }).expect(401);
      await api(tokens.admin).patch('/api/proteccion-endpoints/periodos/999999/registro', { totalActivos: 5 }).expect(404);
      await api(tokens.admin).get('/api/proteccion-endpoints/periodos/999999').expect(404);
      // Un período anulado (la anulación aún no tiene API: se marca en la base de pruebas) no se modifica.
      await prisma.periodoEndpoint.update({ where: { id }, data: { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Prueba de anulación' } });
      const res = await api(tokens.admin).patch(`/api/proteccion-endpoints/periodos/${id}/registro`, { totalActivos: 5 }).expect(409);
      expect(res.body.message).toContain('revierta la anulación');
    }, LENTO);
  });

  describe('Evaluación de Sistemas Productivos · ejecución y cierre', () => {
    it('guardar avance: EN_PROGRESO con la fecha real de las pruebas; no futura; auditado', async () => {
      const id = await planificar(ids.sistema, 10);
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { fechaPruebas: enDias(2) }).expect(400);
      const pruebas = enDias(-1);
      const res = await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { fechaPruebas: pruebas, evidencia: INFORME.evidencia }).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', fechaPruebas: pruebas, tardia: false, situacion: 'PENDIENTE', cerradoPor: null });
      expect(res.body.semestreReal).toMatch(/^S[12]-\d{4}$/);
      const t = (await trazas('EVALUACION_SISTEMA', id)).find((x) => x.accion === 'MODIFICAR')!;
      expect(t.cambios).toEqual(expect.arrayContaining([{ campo: 'fechaPruebas', antes: null, despues: pruebas }]));
      // Sin cambios: 400 (no se generan versiones vacías).
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { fechaPruebas: pruebas }).expect(400);
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { resultado: 'APROBADO' }).expect(400); // sin campo «resultado»
    }, LENTO);

    it('cerrar exige fecha real, informe y repositorio; al cerrar se puede planificar otra del mismo sistema', async () => {
      const id = (await api(tokens.auditor).get(`/api/evaluaciones-sistemas?activoId=${ids.sistema}`).expect(200)).body.data[0].id as number;
      const falta = await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/cerrar`, {}).expect(400);
      expect(falta.body.message).toBe('Para cerrar la evaluación falta: el repositorio del verificable.');
      const res = await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/cerrar`, { repositorioVerificable: INFORME.repositorioVerificable }).expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', situacion: 'CUMPLIDA', tardia: false, cerradoPor: 'analista.test', vencida: false });
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { observacion: 'Cambio tras cerrar.' }).expect(409);
      await planificar(ids.sistema, 40); // la pendiente única por sistema ya no la bloquea
    }, LENTO);

    it('pruebas posteriores a la fecha programada: se permiten, pero cerrar exige justificarlo en la observación', async () => {
      const id = await planificar(ids.otroSistema, 5);
      // La fecha programada pasa a estar en el pasado (simula una evaluación ya vencida).
      const programada = new Date(Date.now() - 10 * 86_400_000);
      await prisma.evaluacionSistema.update({ where: { id }, data: { fechaProgramadaProduccion: programada } });
      expect((await api(tokens.auditor).get(`/api/evaluaciones-sistemas/${id}`).expect(200)).body).toMatchObject({ vencida: true, situacion: 'VENCIDA' });
      const datos = { fechaPruebas: enDias(-2), ...INFORME };
      const sin = await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/cerrar`, datos).expect(400);
      expect(sin.body.message).toContain('posteriores a la fecha programada');
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/cerrar`, { ...datos, observacion: 'Se retrasó.' }).expect(400);
      const res = await api(tokens.analista)
        .patch(`/api/evaluaciones-sistemas/${id}/cerrar`, { ...datos, observacion: 'El proveedor entregó la versión 8 días tarde; aprobado sin hallazgos críticos.' })
        .expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', tardia: true, situacion: 'CUMPLIDA_TARDE' });
      expect((await trazas('EVALUACION_SISTEMA', id)).some((t) => t.motivo.includes('posteriores a la fecha programada, justificadas'))).toBe(true);
    }, LENTO);

    it('reabrir: solo admin con motivo; conserva los datos y vuelve a contar como pendiente', async () => {
      const id = (await api(tokens.auditor).get(`/api/evaluaciones-sistemas?activoId=${ids.otroSistema}`).expect(200)).body.data[0].id as number;
      const motivo = { motivo: 'El informe adjunto correspondía a otra versión del sistema.' };
      await api(tokens.analista).patch(`/api/evaluaciones-sistemas/${id}/reabrir`, motivo).expect(403);
      const antes = (await api(tokens.auditor).get('/api/dashboard/pendientes').expect(200)).body.evaluaciones;
      const res = await api(tokens.admin).patch(`/api/evaluaciones-sistemas/${id}/reabrir`, motivo).expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', evidencia: INFORME.evidencia, cerradoPor: null, situacion: 'VENCIDA' });
      expect((await api(tokens.auditor).get('/api/dashboard/pendientes').expect(200)).body.evaluaciones).toBe(antes + 1);
      await api(tokens.admin).patch(`/api/evaluaciones-sistemas/${id}/reabrir`, motivo).expect(409);
    }, LENTO);

    it('permisos: el auditor no guarda ni cierra (403); sin sesión 401; inexistente 404', async () => {
      const id = await planificar(ids.tercerSistema, 20);
      await api(tokens.auditor).patch(`/api/evaluaciones-sistemas/${id}/ejecucion`, { evidencia: 'x' }).expect(403);
      await api(tokens.auditor).patch(`/api/evaluaciones-sistemas/${id}/cerrar`, {}).expect(403);
      await api().patch(`/api/evaluaciones-sistemas/${id}/cerrar`, {}).expect(401);
      await api(tokens.admin).get('/api/evaluaciones-sistemas/999999').expect(404);
    }, LENTO);
  });

  describe('Bitácora de Evaluación (General y Específica por semestres)', () => {
    it('General: cuenta cada evaluación una vez en su semestre planificado; las cerradas, por su semestre real', async () => {
      const anio = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric' }).format(new Date()));
      const res = await api(tokens.auditor).get(`/api/evaluaciones-sistemas/bitacora/general?anio=${anio}`).expect(200);
      const { total } = res.body;
      // Coincide con el listado (sin anuladas) de las evaluaciones planificadas este año.
      const todas = (await api(tokens.auditor).get('/api/evaluaciones-sistemas?limit=100').expect(200)).body.data as Array<{
        semestrePlanificado: string;
        estado: string;
        situacion: string;
      }>;
      const delAnio = todas.filter((e) => e.semestrePlanificado.endsWith(`-${anio}`));
      expect(total.planificadas).toBe(delAnio.length);
      expect(total.cumplidas).toBe(delAnio.filter((e) => e.estado === 'CERRADO').length);
      expect(total.cumplidasATiempo + total.cumplidasTarde).toBe(total.cumplidas);
      expect(total.pendientes).toBe(total.planificadas - total.cumplidas);
      expect(res.body.semestres).toHaveLength(2);
      await api(tokens.auditor).get('/api/evaluaciones-sistemas/bitacora/general').expect(400); // el año es obligatorio
      await api(tokens.auditor).get(`/api/evaluaciones-sistemas/bitacora/general?anio=${anio}&semestre=3`).expect(400);
    }, LENTO);

    it('Específica: filtra por situación (también la tardía, comparando columnas en la base) y exige el año con el semestre', async () => {
      const tarde = await api(tokens.auditor).get('/api/evaluaciones-sistemas/bitacora/especifica?situacion=CUMPLIDA').expect(200);
      expect(tarde.body.data.every((e: { situacion: string }) => e.situacion === 'CUMPLIDA')).toBe(true);
      const vencidas = await api(tokens.auditor).get('/api/evaluaciones-sistemas/bitacora/especifica?situacion=VENCIDA').expect(200);
      expect(vencidas.body.data.every((e: { situacion: string }) => e.situacion === 'VENCIDA')).toBe(true);
      expect(vencidas.body.meta.total).toBeGreaterThan(0);
      const porSistema = await api(tokens.auditor).get(`/api/evaluaciones-sistemas/bitacora/especifica?activoId=${ids.sistema}`).expect(200);
      expect(porSistema.body.meta.total).toBe(2);
      await api(tokens.auditor).get('/api/evaluaciones-sistemas/bitacora/especifica?semestre=1').expect(400);
      await api(tokens.auditor).get('/api/evaluaciones-sistemas/bitacora/especifica?situacion=OTRA').expect(400);
    }, LENTO);
  });

  it('Swagger documenta las rutas de la fase 2 y la bitácora', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const ruta of [
      '/api/proteccion-endpoints/periodos/{id}/registro',
      '/api/proteccion-endpoints/periodos/{id}/cerrar',
      '/api/proteccion-endpoints/periodos/{id}/reabrir',
      '/api/evaluaciones-sistemas/{id}/ejecucion',
      '/api/evaluaciones-sistemas/{id}/cerrar',
      '/api/evaluaciones-sistemas/{id}/reabrir',
      '/api/evaluaciones-sistemas/bitacora/general',
      '/api/evaluaciones-sistemas/bitacora/especifica',
    ]) {
      expect(res.body.paths[ruta]).toBeDefined();
    }
    expect(res.body.components.schemas.PeriodoEndpointDto.properties).toHaveProperty('cobertura');
    // La bitácora de Mantenimientos conserva su esquema propio.
    expect(res.body.components.schemas.ResumenBitacoraDto.properties).toHaveProperty('ejecucionesCompletadas');
  });
});
