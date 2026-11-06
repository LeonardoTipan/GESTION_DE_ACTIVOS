/**
 * Bitácoras con la fórmula del Excel de Evaluación (semestral), Protección de Endpoints (mensual)
 * y Mantenimientos (semestral, mismo cálculo de siempre). Base gestion_activos_test.
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

const LENTO = 90_000;
const d = (s: string) => new Date(`${s}T12:00:00-05:00`);
interface Periodo { numerador: number | null; denominador: number | null; porcentaje: number | null; situacion: string }
interface Bitacora { indicador: { frecuencia: string; formula: string }; periodos: Periodo[]; informativas: { etiqueta: string; valores: (number | null)[] }[] }

describe('Bitácoras: Evaluación, Endpoints y Mantenimientos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const id: Record<string, number> = {};

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const NINGUNO = Object.fromEntries(Object.keys(APLICA_EN_TODOS).map((k) => [k, false]));
    const apps = await prisma.categoria.create({ data: { ...NINGUNO, aplicaEvaluacion: true, aplicaMantenimiento: true, nombre: 'Aplicativos', descripcion: '' } });
    const pcs = await prisma.categoria.create({ data: { ...NINGUNO, aplicaEndpoint: true, aplicaMantenimiento: true, nombre: 'Computadoras', descripcion: '' } });
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const activo = async (codigo: string, categoriaId: number, extra: object = {}) =>
      (id[codigo] = (await prisma.activo.create({ data: { codigo, nombre: `Activo ${codigo}`, sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: true, ultimaRevision: d('2026-01-01'), categoriaId, criticidadId, ...extra } })).id);
    // Sistemas en producción: alta en GLPI (fechaAlta) aunque se registraran localmente después.
    await activo('APP-1', apps.id, { fechaAlta: d('2024-01-01') });
    await activo('APP-2', apps.id, { fechaAlta: d('2024-01-01') });
    await activo('APP-3', apps.id, { fechaAlta: d('2026-08-15') });
    await activo('APP-BAJA', apps.id, { fechaAlta: d('2024-01-01'), deletedAt: d('2026-03-01') });
    await activo('APP-NO-OP', apps.id, { fechaAlta: d('2024-01-01'), estado: 'Desechado' });
    await activo('PC-1', pcs.id);
    await activo('PC-2', pcs.id);
    await activo('PC-3', pcs.id);

    const evaluacion = (codigo: string, estado: 'ABIERTO' | 'EN_PROGRESO' | 'CERRADO', programada: string, pruebas?: string, extra: object = {}) =>
      prisma.evaluacionSistema.create({
        data: { activoId: id[codigo], fechaProgramadaProduccion: d(programada), responsable: 'SEGURIDAD', descripcion: 'Pruebas de seguridad', estado, fechaPruebas: pruebas ? d(pruebas) : null, ...extra },
      });
    await evaluacion('APP-1', 'CERRADO', '2026-02-01', '2026-02-10');
    await evaluacion('APP-1', 'CERRADO', '2026-04-01', '2026-04-03');
    await evaluacion('APP-2', 'EN_PROGRESO', '2026-03-01');
    await evaluacion('APP-BAJA', 'CERRADO', '2026-02-01', '2026-02-05');
    await evaluacion('APP-2', 'CERRADO', '2026-05-01', '2026-05-02', { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Duplicada.' });
    await evaluacion('APP-3', 'CERRADO', '2026-09-01', '2026-09-10');

    // Endpoints: febrero cerrado con detalle (2 de 3), marzo sin detalle (totales), octubre sin cerrar, abril anulado.
    const feb = await prisma.periodoEndpoint.create({ data: { anio: 2026, mes: 2, responsable: 'TIC', estado: 'CERRADO', totalActivos: 3, equiposConAntivirus: 2, fechaEjecucion: d('2026-02-20') } });
    await prisma.periodoEndpointActivo.createMany({ data: [{ periodoId: feb.id, activoId: id['PC-1'], conAntivirus: true }, { periodoId: feb.id, activoId: id['PC-2'], conAntivirus: true }, { periodoId: feb.id, activoId: id['PC-3'], conAntivirus: false }] });
    await prisma.periodoEndpoint.create({ data: { anio: 2026, mes: 3, responsable: 'TIC', estado: 'CERRADO', totalActivos: 40, equiposConAntivirus: 38 } });
    await prisma.periodoEndpoint.create({ data: { anio: 2026, mes: 4, responsable: 'TIC', estado: 'CERRADO', totalActivos: 10, equiposConAntivirus: 1, anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Abierto por error.' } });
    const oct = await prisma.periodoEndpoint.create({ data: { anio: 2026, mes: 10, responsable: 'TIC', estado: 'EN_PROGRESO' } });
    await prisma.periodoEndpointActivo.createMany({ data: [{ periodoId: oct.id, activoId: id['PC-1'], conAntivirus: true }, { periodoId: oct.id, activoId: id['PC-2'], conAntivirus: null }] });

    // Mantenimientos: S1 con 2 planes (1 cumplido) y 1 suspendido; S2 con 1 plan pendiente.
    const plan = (codigo: string, inicio: string, estado: 'VIGENTE' | 'SUSPENDIDO' = 'VIGENTE') =>
      prisma.planMantenimiento.create({ data: { activoId: id[codigo], tipo: 'PREVENTIVO', frecuencia: 'SEMESTRAL', fechaInicio: d(inicio), responsable: 'INFRA', actividades: 'Limpieza', estado } });
    const p1 = await plan('PC-1', '2026-02-01');
    await plan('PC-2', '2026-03-01');
    await plan('PC-3', '2026-04-01', 'SUSPENDIDO');
    await plan('APP-1', '2026-08-01');
    await prisma.mantenimiento.create({ data: { activoId: id['PC-1'], planId: p1.id, fase: 'FINALIZADO', tipo: 'PREVENTIVO', fecha: d('2026-02-03'), fechaInicio: d('2026-02-03'), fechaFin: d('2026-02-03'), actividad: 'Limpieza realizada' } });
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token = tokens.auditor) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  describe('Evaluación de Sistemas Productivos (semestral)', () => {
    it('pruebas ejecutadas (sistemas distintos) ÷ total de sistemas en producción al corte', async () => {
      const b = (await get('/api/evaluaciones-sistemas/bitacora/indicador?anio=2026').expect(200)).body as Bitacora;
      expect(b.indicador).toMatchObject({ frecuencia: 'SEMESTRAL', formula: 'Pruebas de seguridad ejecutadas (sistemas productivos) / Total sistemas en producción' });
      // S1: en producción APP-1 y APP-2 (APP-BAJA salió antes del corte; APP-NO-OP no es operativo). Evaluado APP-1 (dos veces = 1).
      expect(b.periodos[0]).toMatchObject({ numerador: 1, denominador: 2, porcentaje: 50 });
      // S2 (en curso, corte hoy): APP-1, APP-2 y APP-3; evaluado APP-3.
      expect(b.periodos[1]).toMatchObject({ numerador: 1, denominador: 3, porcentaje: 33.3 });
      const inf = (e: string) => b.informativas.find((f) => f.etiqueta === e)!.valores;
      expect(inf('Evaluaciones cerradas en el semestre')).toEqual([3, 1]);
      expect(inf('Sistemas evaluados fuera del inventario de producción')).toEqual([1, 0]);
      expect(inf('Planificadas sin ejecutar')[0]).toBe(1);
    });

    it('los sistemas del semestre justifican el denominador y el numerador', async () => {
      const s = (await get('/api/evaluaciones-sistemas/bitacora/sistemas?anio=2026&semestre=1').expect(200)).body as { activo: { codigo: string }; evaluado: boolean; evaluaciones: number[] }[];
      expect(s.map((x) => [x.activo.codigo, x.evaluado, x.evaluaciones.length])).toEqual([['APP-1', true, 2], ['APP-2', false, 0]]);
    });

    it('específica por fecha real de pruebas: exactamente las evaluaciones del numerador (sin anuladas)', async () => {
      const r = (await get('/api/evaluaciones-sistemas/bitacora/especifica?anio=2026&semestre=1&segun=PRUEBAS').expect(200)).body;
      expect(r.meta.total).toBe(3);
      expect(r.data.every((e: { estado: string }) => e.estado === 'CERRADO')).toBe(true);
      // Por planificación sigue funcionando como antes (incluye la que está en progreso).
      expect((await get('/api/evaluaciones-sistemas/bitacora/especifica?anio=2026&semestre=1').expect(200)).body.meta.total).toBe(4);
    });
  });

  describe('Protección de Endpoints (mensual)', () => {
    it('del período CERRADO: detalle por equipo o totales anteriores; sin cerrar y anulados no cuentan', async () => {
      const b = (await get('/api/proteccion-endpoints/periodos/bitacora/general?anio=2026').expect(200)).body as Bitacora;
      expect(b.indicador).toMatchObject({ frecuencia: 'MENSUAL', formula: 'Equipos con antivirus activo / Total activos' });
      expect(b.periodos.slice(1, 4).map((p) => [p.numerador, p.denominador, p.porcentaje])).toEqual([[2, 3, 66.7], [38, 40, 95], [0, 0, null]]);
      expect(b.periodos[9]).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
      expect(b.informativas.find((f) => f.etiqueta === 'Equipos por registrar (período sin cerrar)')!.valores[9]).toBe(1);
      expect(b.informativas.find((f) => f.etiqueta === 'Equipos sin antivirus')!.valores[1]).toBe(1);
    });
  });

  describe('Mantenimientos (semestral)', () => {
    it('el formato del Excel coincide con la Bitácora General existente', async () => {
      const b = (await get('/api/mantenimientos/bitacora/indicador?anio=2026').expect(200)).body as Bitacora;
      const g = (await get('/api/mantenimientos/bitacora/general?anio=2026').expect(200)).body as { semestres: { cumplidas: number; esperadas: number; cumplimiento: number | null }[] };
      expect(b.indicador).toMatchObject({ frecuencia: 'SEMESTRAL', formula: 'Mantenimientos ejecutados en la infraestructura tecnológica / Total Planificados' });
      expect(b.periodos.map((p) => [p.numerador, p.denominador, p.porcentaje])).toEqual(g.semestres.map((s) => [s.cumplidas, s.esperadas, s.cumplimiento]));
      expect(b.periodos.map((p) => [p.numerador, p.denominador])).toEqual([[1, 2], [0, 1]]);
      expect(b.informativas.find((f) => f.etiqueta === 'Suspendidas sin ejecución')!.valores[0]).toBe(1);
    });
  });

  it('todas las rutas son de consulta para todos los roles y exigen el año', async () => {
    for (const ruta of ['/api/evaluaciones-sistemas/bitacora/indicador', '/api/proteccion-endpoints/periodos/bitacora/general', '/api/mantenimientos/bitacora/indicador']) {
      await get(ruta).expect(400);
      await get(`${ruta}?anio=2026`, tokens.analista).expect(200);
    }
    await get('/api/evaluaciones-sistemas/bitacora/sistemas?anio=2026').expect(400);
  });
});
