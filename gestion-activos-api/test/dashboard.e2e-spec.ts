/**
 * Tablero: GET /api/dashboard/pendientes contra MySQL (gestion_activos_test) y el
 * Keycloak de desarrollo. Los datos se siembran directamente en la base de pruebas
 * con estados conocidos de los seis módulos.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RenovacionesService } from './../src/renewals/renovaciones.service.js';
import { setupSwagger } from './../src/swagger.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba, tamper } from './utils/keycloak.js';
import { vi } from 'vitest';

const LENTO = 30_000;

describe('Tablero: trámites pendientes por módulo (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let n = 0;

  const pendientes = (token: string) =>
    request(app.getHttpServer()).get('/api/dashboard/pendientes').set('Authorization', `Bearer ${token}`);

  const acceso = (estado: 'ABIERTO' | 'PENDIENTE' | 'CERRADO') =>
    prisma.controlAcceso.create({
      data: {
        codigoUnico: `CAL-T${++n}`,
        tipoAcceso: 'LOGICO',
        activoId,
        fechaSolicitud: new Date('2026-10-01T10:00:00Z'),
        nombreSolicitante: 'Jefe TIC',
        nombreUsuarioBeneficiario: 'Usuario de prueba',
        departamento: 'TIC',
        tipoSolicitud: 'ACCESO',
        descripcion: 'Acceso al sistema contable',
        estado,
        ...(estado === 'CERRADO' ? { resolucion: 'Acceso otorgado', fechaAtendido: new Date('2026-10-02T10:00:00Z') } : {}),
      },
    });
  const mantenimiento = (fase: 'PROGRAMADO' | 'EN_EJECUCION' | 'FINALIZADO' | 'CANCELADO', anulado = false) =>
    prisma.mantenimiento.create({
      data: {
        activoId,
        tipo: 'PREVENTIVO',
        fase,
        actividad: 'Limpieza y actualización',
        fecha: new Date('2026-10-05T10:00:00Z'),
        ...(anulado ? { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registro duplicado por error' } : {}),
      },
    });
  const vulnerabilidad = (estado: 'ABIERTO' | 'EN_PROGRESO' | 'REMEDIADO', anulado = false) =>
    prisma.vulnerabilidad.create({
      data: {
        activoId,
        descripcion: 'Versión de OpenSSL vulnerable',
        nivelRiesgo: 'ALTO',
        estado,
        fecha: new Date('2026-10-05T10:00:00Z'),
        ...(anulado ? { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registro duplicado por error' } : {}),
      },
    });
  const renovacion = (estado: 'ABIERTO' | 'EN_PROGRESO' | 'CERRADO', anulado = false) =>
    prisma.renovacion.create({
      data: {
        activoId,
        tipo: 'LICENCIA',
        responsable: 'ANALISTA 1',
        fechaPlanificada: new Date('2026-11-01T00:00:00Z'),
        fechaCaducidadActual: new Date('2026-11-30T00:00:00Z'),
        estado,
        ...(anulado ? { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registro duplicado por error' } : {}),
      },
    });
  const periodo = (mes: number, estado: 'ABIERTO' | 'EN_PROGRESO' | 'CERRADO', anulado = false) =>
    prisma.periodoEndpoint.create({
      data: {
        anio: 2026,
        mes,
        responsable: 'Soporte TIC',
        estado,
        ...(anulado ? { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registro duplicado por error' } : {}),
      },
    });
  const evaluacion = (estado: 'ABIERTO' | 'EN_PROGRESO' | 'CERRADO', fecha: string, anulado = false) =>
    prisma.evaluacionSistema.create({
      data: {
        activoId,
        fechaProgramadaProduccion: new Date(fecha),
        responsable: 'Seguridad TIC',
        descripcion: 'Pruebas de seguridad de la versión 2.1',
        estado,
        ...(anulado ? { anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Registro duplicado por error' } : {}),
      },
    });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const categoriaId = (await prisma.categoria.create({ data: { nombre: 'Aplicativos', descripcion: '', claseMantenimiento: 'SOFTWARE' } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    activoId = (
      await prisma.activo.create({
        data: { codigo: 'AC-DASH', nombre: 'SICET', categoriaId, criticidadId, sistemas: '', custodio: 'TIC', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), estado: 'Bueno' },
      })
    ).id;
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  it('sin trámites, todo en 0 (son ceros reales, no un fallo)', async () => {
    const res = await pendientes(tokens.admin).expect(200);
    expect(res.body).toEqual({ accesos: 0, mantenimientos: 0, vulnerabilidades: 0, renovaciones: 0, endpoints: 0, evaluaciones: 0, total: 0 });
  });

  it('cuenta ABIERTO y EN_PROGRESO (y sus equivalentes); excluye cerrados y anulados; total = suma', async () => {
    // Control de acceso: ABIERTO ×2 + PENDIENTE (en gestión) ×1 → 3; CERRADO ×2 no.
    const a = await acceso('ABIERTO');
    await acceso('ABIERTO');
    await acceso('PENDIENTE');
    await acceso('CERRADO');
    await acceso('CERRADO');
    // Mantenimientos: PROGRAMADO + EN_EJECUCION → 2; FINALIZADO, CANCELADO y un PROGRAMADO anulado no.
    await mantenimiento('PROGRAMADO');
    await mantenimiento('EN_EJECUCION');
    await mantenimiento('FINALIZADO');
    await mantenimiento('CANCELADO');
    await mantenimiento('PROGRAMADO', true);
    // Vulnerabilidades: ABIERTO + EN_PROGRESO → 2; REMEDIADO y una ABIERTO anulada no.
    await vulnerabilidad('ABIERTO');
    await vulnerabilidad('EN_PROGRESO');
    await vulnerabilidad('REMEDIADO');
    await vulnerabilidad('ABIERTO', true);
    // Renovaciones: ABIERTO + EN_PROGRESO → 2; CERRADO y una ABIERTO anulada no.
    const r = await renovacion('ABIERTO');
    await renovacion('EN_PROGRESO');
    await renovacion('CERRADO');
    await renovacion('ABIERTO', true);
    // Protección de Endpoints: ABIERTO + EN_PROGRESO → 2 (un registro por mes); CERRADO y un ABIERTO anulado no.
    await periodo(1, 'ABIERTO');
    await periodo(2, 'EN_PROGRESO');
    await periodo(3, 'CERRADO');
    await periodo(4, 'ABIERTO', true);
    // Evaluación: ABIERTO (VENCIDA: fecha programada pasada) + EN_PROGRESO → 2; la vencida cuenta
    // UNA vez, no como pendiente y además como vencida. CERRADO y una ABIERTO anulada no.
    await evaluacion('ABIERTO', '2020-01-15T10:00:00Z');
    await evaluacion('EN_PROGRESO', '2099-01-15T10:00:00Z');
    await evaluacion('CERRADO', '2099-02-15T10:00:00Z');
    await evaluacion('ABIERTO', '2099-03-15T10:00:00Z', true);

    // Historial y auditoría no son registros de negocio: no suman.
    await prisma.historialControlAcceso.createMany({
      data: [1, 2, 3].map((i) => ({ controlAccesoId: a.id, campo: 'descripcion', valorAnterior: `v${i}`, valorNuevo: `v${i + 1}`, usuario: 'analista.test' })),
    });
    await prisma.registroCambio.create({
      data: { entidad: 'RENOVACION', registroId: r.id, version: 1, accion: 'REGISTRAR', motivo: 'Alta', cambios: '[]', responsable: 'analista.test' },
    });

    const res = await pendientes(tokens.admin).expect(200);
    expect(res.body).toEqual({ accesos: 3, mantenimientos: 2, vulnerabilidades: 2, renovaciones: 2, endpoints: 2, evaluaciones: 2, total: 13 });
    const { total, ...modulos } = res.body as Record<string, number>;
    expect(total).toBe(Object.values(modulos).reduce((a, b) => a + b, 0));
  }, LENTO);

  it('coincide con los listados de cada módulo (sin anulados) para el mismo usuario', async () => {
    const get = (ruta: string) => request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${tokens.auditor}`).expect(200);
    const [abiertos, enGestion, programados, enEjecucion, vAbiertas, vEnProgreso, renov, pAbiertos, pEnProgreso, evals, vencidas] = await Promise.all([
      get('/api/control-acceso?estado=ABIERTO'),
      get('/api/control-acceso?estado=PENDIENTE'),
      get('/api/mantenimientos?fase=PROGRAMADO&incluirAnulados=false'),
      get('/api/mantenimientos?fase=EN_EJECUCION&incluirAnulados=false'),
      get('/api/vulnerabilidades?estado=ABIERTO&incluirAnulados=false'),
      get('/api/vulnerabilidades?estado=EN_PROGRESO&incluirAnulados=false'),
      get('/api/renovaciones?pendientes=true&incluirAnulados=false'),
      get('/api/proteccion-endpoints/periodos?estado=ABIERTO'),
      get('/api/proteccion-endpoints/periodos?estado=EN_PROGRESO'),
      get('/api/evaluaciones-sistemas?pendientes=true'),
      get('/api/evaluaciones-sistemas?vencidas=true'),
    ]);
    const res = await pendientes(tokens.auditor).expect(200);
    expect(res.body.accesos).toBe(abiertos.body.meta.total + enGestion.body.meta.total);
    expect(res.body.mantenimientos).toBe(programados.body.meta.total + enEjecucion.body.meta.total);
    expect(res.body.vulnerabilidades).toBe(vAbiertas.body.meta.total + vEnProgreso.body.meta.total);
    expect(res.body.renovaciones).toBe(renov.body.meta.total);
    expect(res.body.endpoints).toBe(pAbiertos.body.meta.total + pEnProgreso.body.meta.total);
    expect(res.body.evaluaciones).toBe(evals.body.meta.total);
    // Las vencidas son un subconjunto de las pendientes: no se suman aparte.
    expect(vencidas.body.meta.total).toBe(1);
    expect(evals.body.data.some((e: { vencida: boolean }) => e.vencida)).toBe(true);
  }, LENTO);

  it('un cambio de estado se refleja: al cerrar una solicitud baja un pendiente', async () => {
    const abierta = await prisma.controlAcceso.findFirstOrThrow({ where: { estado: 'ABIERTO' } });
    await request(app.getHttpServer())
      .patch(`/api/control-acceso/${abierta.id}/cerrar`)
      .set('Authorization', `Bearer ${tokens.analista}`)
      .send({ fechaAtendido: '2026-10-03T15:00:00.000Z', resolucion: 'Acceso otorgado en el sistema contable.' })
      .expect(200);
    const res = await pendientes(tokens.analista).expect(200);
    expect(res.body).toMatchObject({ accesos: 2, endpoints: 2, evaluaciones: 2, total: 12 });
  }, LENTO);

  it('lo consultan admin, analista y auditor; sin sesión válida, 401', async () => {
    for (const token of [tokens.admin, tokens.analista, tokens.auditor]) await pendientes(token).expect(200);
    await request(app.getHttpServer()).get('/api/dashboard/pendientes').expect(401);
    await pendientes(tamper(tokens.admin)).expect(401);
  }, LENTO);

  it('si un conteo falla responde 500 genérico; nunca ceros ni detalles internos', async () => {
    const espia = vi
      .spyOn(app.get(RenovacionesService), 'contarPendientes')
      .mockRejectedValueOnce(new Error("Can't reach database server at db:3306"));
    const res = await pendientes(tokens.admin).expect(500);
    expect(res.body.message).toBe('No se pudieron contar los trámites pendientes. Inténtelo de nuevo.');
    expect(JSON.stringify(res.body)).not.toMatch(/3306|database|accesos/);
    espia.mockRestore();
    await pendientes(tokens.admin).expect(200);
  });

  it('Swagger documenta el contrato', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.paths['/api/dashboard/pendientes'].get).toBeDefined();
    expect(Object.keys(res.body.components.schemas.PendientesTableroDto.properties).sort()).toEqual(
      ['accesos', 'endpoints', 'evaluaciones', 'mantenimientos', 'renovaciones', 'total', 'vulnerabilidades'],
    );
    // Respaldos ya tenía un esquema «PendientesDto»: el del tablero no debe pisarlo.
    expect(res.body.components.schemas.PendientesDto.properties).toHaveProperty('ejecucion');
  });
});
