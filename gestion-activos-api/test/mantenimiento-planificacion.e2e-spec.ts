/**
 * Planificación → Ejecución (1→N), fechas reales, tipos por clase, auditoría y
 * Bitácoras General y Específica, contra MySQL (gestion_activos_test) y el
 * Keycloak de desarrollo. Datos en 2025 (pasado): los semestres son fijos.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APLICA_EN_TODOS, limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 30_000;
const MOTIVO = 'Corrección registrada tras revisar el informe de mantenimiento.';
/** Mediodía UTC = 07:00 en Guayaquil: el día no cambia. */
const dia = (d: string) => `${d}T12:00:00.000Z`;

describe('Mantenimiento: planificación, ejecución y bitácoras (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let pc: number; // hardware
  let app1: number; // software

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const hw = await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Computadoras', descripcion: '', claseMantenimiento: 'HARDWARE' } });
    const sw = await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Aplicativos', descripcion: '', claseMantenimiento: 'SOFTWARE' } });
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: false, ultimaRevision: new Date('2025-01-01'), criticidadId };
    pc = (await prisma.activo.create({ data: { ...base, codigo: 'PC-0001', nombre: 'PC Contabilidad', categoriaId: hw.id } })).id;
    app1 = (await prisma.activo.create({ data: { ...base, codigo: 'AC-0001', nombre: 'SICET', categoriaId: sw.id } })).id;
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
  const planificar = async (activoId: number, tipo: string, fechaInicio: string, extra: object = {}) =>
    (
      await api(tokens.analista)
        .post('/api/mantenimientos/planes', {
          tipo,
          frecuencia: 'SEMESTRAL',
          fechaInicio,
          responsable: 'Soporte TIC',
          actividades: 'Limpieza física y actualización de parches de seguridad.',
          activoIds: [activoId],
          ...extra,
        })
        .expect(201)
    ).body[0] as { id: number };
  const ejecutar = async (planId: number, fecha: string, fechaLimite: string) =>
    (await api(tokens.analista).post('/api/mantenimientos', { planId, fecha, fechaLimite }).expect(201)).body as { id: number };
  const FINALIZAR = {
    resultado: 'Limpieza realizada y parches aplicados.',
    estadoEquipo: 'OPERATIVO',
    diagnostico: 'Sin novedades.',
    duracionMin: 60,
    evidencia: 'Informe MT-2025-01',
    repositorioVerificable: 'Carpeta Compartida TICs/Interno/Mantenimientos',
  };
  const finalizar = (id: number, fin: string) =>
    api(tokens.analista).patch(`/api/mantenimientos/${id}/finalizar`, { ...FINALIZAR, fechaFin: fin }).expect(200);
  const completar = async (id: number, inicio: string, fin: string) => {
    await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: inicio, tecnico: 'jperez' }).expect(200);
    return finalizar(id, fin);
  };
  const trazas = async (id: number) =>
    (await api(tokens.auditor).get(`/api/trazas?entidad=MANTENIMIENTO&registroId=${id}`).expect(200)).body as {
      accion: string; version: number; responsable: string; motivo: string; cambios: { campo: string; antes: unknown; despues: unknown }[];
    }[];

  // Planificaciones del escenario.
  let junio: number; // PREVENTIVO pc, S1 (ejecutada en julio, dos veces)
  let predictivo: number; // PREDICTIVO pc, S1, pendiente
  let evolutivo: number; // EVOLUTIVO app, S1, completada en marzo
  let perfectivo: number; // PERFECTIVO app, S1, suspendida
  let correctivo: number; // CORRECTIVO pc, S2, pendiente
  let ejecucionJulio: number;

  describe('1, 2 y 6 · planificación vinculada a activos y tipos por clase', () => {
    it('1 · crea una planificación de un activo existente; el semestre sale de la fecha de inicio planificada', async () => {
      const res = await api(tokens.analista)
        .post('/api/mantenimientos/planes', {
          tipo: 'PREVENTIVO',
          frecuencia: 'SEMESTRAL',
          fechaInicio: dia('2025-06-20'),
          responsable: 'Soporte TIC',
          actividades: 'Limpieza física y actualización de parches de seguridad.',
          activoIds: [pc],
        })
        .expect(201);
      expect(res.body[0]).toMatchObject({
        activoId: pc,
        activo: { codigo: 'PC-0001' },
        frecuencia: 'SEMESTRAL',
        fechaInicio: dia('2025-06-20'),
        proximaFecha: dia('2025-06-20'),
        semestrePlanificado: { anio: 2025, semestre: 1, etiqueta: 'S1-2025' },
        ejecucionesCompletadas: 0,
      });
      junio = res.body[0].id;
    });

    it('2 · rechaza un activo inexistente → 400', async () => {
      const res = await api(tokens.analista)
        .post('/api/mantenimientos/planes', {
          tipo: 'PREVENTIVO', frecuencia: 'UNICA', fechaInicio: dia('2025-06-20'), responsable: 'Soporte', actividades: 'Revisión general del equipo.', activoIds: [999999],
        })
        .expect(400);
      expect(res.body.message).toMatch(/no existe/);
    });

    it('6 · tipos permitidos según la clase del activo (hardware / software)', async () => {
      const cuerpo = { frecuencia: 'UNICA', fechaInicio: dia('2025-03-15'), responsable: 'Desarrollo', actividades: 'Mejora del módulo de reportes.' };
      const sw = await api(tokens.analista).post('/api/mantenimientos/planes', { ...cuerpo, tipo: 'PREDICTIVO', activoIds: [app1] }).expect(400);
      expect(sw.body.message).toMatch(/no corresponde a software/);
      const hw = await api(tokens.analista).post('/api/mantenimientos/planes', { ...cuerpo, tipo: 'EVOLUTIVO', activoIds: [pc] }).expect(400);
      expect(hw.body.message).toMatch(/no corresponde a hardware/);
      await api(tokens.analista).post('/api/mantenimientos/planes', { ...cuerpo, tipo: 'INVENTADO', activoIds: [pc] }).expect(400);

      evolutivo = (await planificar(app1, 'EVOLUTIVO', dia('2025-03-15'), { frecuencia: 'UNICA' })).id;
      perfectivo = (await planificar(app1, 'PERFECTIVO', dia('2025-04-01'))).id;
      predictivo = (await planificar(pc, 'PREDICTIVO', dia('2025-02-10'))).id;
      correctivo = (await planificar(pc, 'CORRECTIVO', dia('2025-09-01'), { frecuencia: 'UNICA' })).id;
    });

    it('filtra planificaciones por año y semestre planificados; el semestre exige el año', async () => {
      const s1 = await api(tokens.auditor).get('/api/mantenimientos/planes?anio=2025&semestre=1').expect(200);
      expect(s1.body.meta.total).toBe(4);
      const s2 = await api(tokens.auditor).get('/api/mantenimientos/planes?anio=2025&semestre=2').expect(200);
      expect(s2.body.data.map((p: { id: number }) => p.id)).toEqual([correctivo]);
      await api(tokens.auditor).get('/api/mantenimientos/planes?semestre=1').expect(400);
    });
  });

  describe('3, 4, 5, 7, 8, 9 y 10 · ejecución', () => {
    it('3 · registra una ejecución de su planificación: activo, tipo y descripción salen de ella', async () => {
      const res = await api(tokens.analista)
        .post('/api/mantenimientos', { planId: junio, fecha: dia('2025-06-20'), fechaLimite: dia('2025-07-31') })
        .expect(201);
      expect(res.body).toMatchObject({
        planId: junio,
        activoId: pc,
        tipo: 'PREVENTIVO',
        fase: 'PROGRAMADO',
        actividad: 'Limpieza física y actualización de parches de seguridad.',
        plan: { id: junio, frecuencia: 'SEMESTRAL', responsable: 'Soporte TIC' },
        semestrePlanificado: { etiqueta: 'S1-2025' },
        semestreReal: null,
      });
      ejecucionJulio = res.body.id;
    });

    it('9 · al iniciar no se acepta una fecha real futura → 400', async () => {
      const futura = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await api(tokens.analista).patch(`/api/mantenimientos/${ejecucionJulio}/iniciar`, { fechaInicio: futura }).expect(400);
    });

    it('4, 5 y 10 · fechas reales distintas de las planificadas, en otro semestre; el registro no las sustituye', async () => {
      const inicio = '2025-07-03T14:00:00.000Z';
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${ejecucionJulio}/iniciar`, { fechaInicio: inicio, tecnico: 'jperez' })
        .expect(200);
      expect(res.body).toMatchObject({
        fase: 'EN_EJECUCION',
        fechaInicio: inicio, // la indicada, no la hora del servidor
        fecha: dia('2025-06-20'), // lo previsto no cambia
        semestrePlanificado: { etiqueta: 'S1-2025' },
        semestreReal: { etiqueta: 'S2-2025' },
      });
      // La fecha de registro es automática y distinta de la real.
      expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThanOrEqual(2026);
      expect(res.body.createdAt).not.toBe(inicio);
    });

    it('9 · la fecha final no puede ser anterior a la inicial → 400', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${ejecucionJulio}/finalizar`, { ...FINALIZAR, fechaFin: '2025-07-02T14:00:00.000Z' })
        .expect(400);
      expect(res.body.message).toMatch(/anterior a la fecha real de mantenimiento/);
    });

    it('8 · una ejecución completada no puede carecer de los datos obligatorios → 400', async () => {
      const url = `/api/mantenimientos/${ejecucionJulio}/finalizar`;
      const fechaFin = '2025-07-03T20:00:00.000Z';
      const { resultado: _r, ...sinDescripcion } = FINALIZAR;
      const { estadoEquipo: _e, ...sinCondicion } = FINALIZAR;
      await api(tokens.analista).patch(url, { ...sinDescripcion, fechaFin }).expect(400);
      await api(tokens.analista).patch(url, { ...sinCondicion, fechaFin }).expect(400);
      await api(tokens.analista).patch(url, FINALIZAR).expect(400); // sin fecha real de fin
      expect((await prisma.mantenimiento.findUniqueOrThrow({ where: { id: ejecucionJulio } })).fase).toBe('EN_EJECUCION');
    });

    it('7 · completar y transiciones no permitidas (409) desde Completado', async () => {
      const res = await finalizar(ejecucionJulio, '2025-07-03T20:00:00.000Z');
      expect(res.body).toMatchObject({
        fase: 'FINALIZADO',
        fechaFin: '2025-07-03T20:00:00.000Z',
        evidencia: 'Informe MT-2025-01',
        repositorioVerificable: 'Carpeta Compartida TICs/Interno/Mantenimientos',
      });
      await api(tokens.analista).patch(`/api/mantenimientos/${ejecucionJulio}/iniciar`, { fechaInicio: dia('2025-07-04') }).expect(409);
      await api(tokens.analista).patch(`/api/mantenimientos/${ejecucionJulio}/cancelar`, { motivo: 'Ya no aplica' }).expect(409);
    });

    it('7 · cancelar exige motivo; guarda su propia fecha y no inventa una fecha real de fin', async () => {
      const { id } = await ejecutar(junio, dia('2025-07-05'), dia('2025-07-08'));
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/cancelar`, {}).expect(400);
      const res = await api(tokens.analista).patch(`/api/mantenimientos/${id}/cancelar`, { motivo: 'El proveedor no asistió.' }).expect(200);
      expect(res.body).toMatchObject({ fase: 'CANCELADO', resultado: 'El proveedor no asistió.', fechaFin: null, fechaInicio: null });
      expect(res.body.fechaCancelacion).toEqual(expect.any(String));
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: dia('2025-07-06') }).expect(409);
    });

    it('una ejecución adicional desde la planificación no adelanta la próxima fecha del período', async () => {
      const antes = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: junio } });
      await api(tokens.analista).post(`/api/mantenimientos/planes/${junio}/programar`, { adicional: true }).expect(400); // adicional exige fecha
      const res = await api(tokens.analista)
        .post(`/api/mantenimientos/planes/${junio}/programar`, { adicional: true, fecha: dia('2025-07-10') })
        .expect(201);
      const despues = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: junio } });
      expect(despues.proximaFecha).toEqual(antes.proximaFecha);
      // Segunda ejecución COMPLETADA de la misma planificación (para la prueba 12).
      await completar(res.body.mantenimientoId, dia('2025-07-11'), '2025-07-11T18:00:00.000Z');
      // Y la del evolutivo, completada en marzo (S1 real).
      const e = await ejecutar(evolutivo, dia('2025-03-15'), dia('2025-03-20'));
      await completar(e.id, dia('2025-03-16'), dia('2025-03-17'));
    }, LENTO);
  });

  describe('11 · auditoría: cada cambio en la misma transacción, con el usuario de la sesión', () => {
    it('iniciar y completar dejan su traza (situación y fechas reales) y la versión cuadra', async () => {
      const t = await trazas(ejecucionJulio);
      const m = await prisma.mantenimiento.findUniqueOrThrow({ where: { id: ejecucionJulio } });
      expect(m.version).toBe(1 + t.length);
      const inicio = t.find((x) => x.motivo === 'Inicio de la ejecución.')!;
      expect(inicio).toMatchObject({ accion: 'MODIFICAR', responsable: 'analista.test' });
      expect(inicio.cambios).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'fase', antes: 'PROGRAMADO', despues: 'EN_EJECUCION' })]));
      const fin = t.find((x) => x.motivo === 'Ejecución completada.')!;
      expect(fin.cambios.map((c) => c.campo)).toEqual(expect.arrayContaining(['fase', 'fechaFin', 'estadoEquipo', 'repositorioVerificable']));
    });

    it('una transición rechazada (409) no deja traza ni sube la versión', async () => {
      const antes = await trazas(ejecucionJulio);
      await api(tokens.analista).patch(`/api/mantenimientos/${ejecucionJulio}/iniciar`, { fechaInicio: dia('2025-07-04') }).expect(409);
      expect(await trazas(ejecucionJulio)).toHaveLength(antes.length);
    });

    it('corregir lo ejecutado de una completada: analista 403; admin con motivo, auditado', async () => {
      const url = `/api/mantenimientos/${ejecucionJulio}/ejecucion`;
      await api(tokens.analista).patch(url, { fechaInicio: '2025-07-03T13:00:00.000Z', motivoCambio: MOTIVO }).expect(403);
      await api(tokens.admin).patch(url, { fechaInicio: '2025-07-03T13:00:00.000Z' }).expect(400); // sin motivo
      await api(tokens.admin).patch(url, { tipo: 'EVOLUTIVO', motivoCambio: MOTIVO }).expect(400); // no es de hardware
      await api(tokens.admin).patch(url, { fechaFin: '2025-07-01T00:00:00.000Z', motivoCambio: MOTIVO }).expect(400); // fin < inicio
      const res = await api(tokens.admin)
        .patch(url, { fechaInicio: '2025-07-03T13:00:00.000Z', observaciones: 'Hora corregida según el acta.', motivoCambio: MOTIVO })
        .expect(200);
      expect(res.body.fechaInicio).toBe('2025-07-03T13:00:00.000Z');
      const [ultima] = await trazas(ejecucionJulio);
      expect(ultima).toMatchObject({ accion: 'MODIFICAR', responsable: 'admin.test', motivo: MOTIVO });
      expect(ultima.cambios).toEqual(
        expect.arrayContaining([expect.objectContaining({ campo: 'fechaInicio', antes: '2025-07-03T14:00:00.000Z', despues: '2025-07-03T13:00:00.000Z' })]),
      );
    });

    it('suspender una planificación exige motivo y deja traza', async () => {
      await api(tokens.analista).patch(`/api/mantenimientos/planes/${perfectivo}`, { estado: 'SUSPENDIDO' }).expect(400);
      await api(tokens.analista).patch(`/api/mantenimientos/planes/${perfectivo}`, { estado: 'SUSPENDIDO', motivoCambio: MOTIVO }).expect(200);
    });
  });

  describe('12 y 13 · Bitácora General', () => {
    it('cuenta cada planificación una vez en su semestre planificado; ejecuciones por semestre real; cumplimiento', async () => {
      const { body } = await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025').expect(200);
      const [s1, s2] = body.semestres;
      // S1: junio (dos ejecuciones completadas en julio = UNA cumplida), evolutivo (cumplida),
      // predictivo (pendiente) y perfectivo (suspendido, fuera del cálculo).
      expect(s1).toMatchObject({
        periodo: { anio: 2025, semestre: 1, etiqueta: 'S1-2025' },
        planificadas: 4, suspendidas: 1, esperadas: 3, cumplidas: 2, pendientes: 1,
        ejecucionesCompletadas: 1, // solo la de marzo: las de julio son del S2 real
        ejecucionesSinPlanificacion: 0,
        cumplimiento: 66.7,
      });
      expect(s2).toMatchObject({
        periodo: { etiqueta: 'S2-2025' },
        planificadas: 1, cumplidas: 0, pendientes: 1,
        ejecucionesCompletadas: 2, // las dos de julio (planificadas en el S1)
        cumplimiento: 0,
      });
      expect(body.total).toMatchObject({
        periodo: { anio: 2025, semestre: null, etiqueta: '2025' },
        planificadas: 5, suspendidas: 1, esperadas: 4, cumplidas: 2, pendientes: 2, ejecucionesCompletadas: 3, cumplimiento: 50,
      });
    });

    it('un semestre solo; año sin datos: cumplimiento null; parámetros inválidos → 400', async () => {
      const s1 = await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025&semestre=1').expect(200);
      expect(s1.body.semestres).toHaveLength(1);
      expect(s1.body.total).toMatchObject({ periodo: { etiqueta: 'S1-2025' }, cumplidas: 2, cumplimiento: 66.7 });
      const vacio = await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2024').expect(200);
      expect(vacio.body.total).toMatchObject({ planificadas: 0, cumplimiento: null });
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/general').expect(400);
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025&semestre=3').expect(400);
    });

    it('la planificación muestra cuántas ejecuciones completadas tiene', async () => {
      const res = await api(tokens.auditor).get(`/api/mantenimientos/planes/${junio}`).expect(200);
      expect(res.body).toMatchObject({ ejecucionesCompletadas: 2, intervenciones: 3 });
    });
  });

  describe('14 · Bitácora Específica: filtros y paginación', () => {
    const especifica = async (q: string) => (await api(tokens.auditor).get(`/api/mantenimientos/bitacora/especifica?${q}`).expect(200)).body;

    it('S1-2025: una fila por ejecución y una por planificación sin ejecución', async () => {
      const r = await especifica('anio=2025&semestre=1&limit=100');
      // junio: 3 ejecuciones (2 completadas + 1 cancelada); evolutivo: 1; predictivo y perfectivo: sin ejecución.
      expect(r.meta.total).toBe(6);
      const claves = r.data.map((f: { clave: string }) => f.clave);
      expect(claves).toEqual(expect.arrayContaining([`P-${predictivo}`, `P-${perfectivo}`, `E-${ejecucionJulio}`]));
      const julio = r.data.find((f: { clave: string }) => f.clave === `E-${ejecucionJulio}`);
      expect(julio).toMatchObject({
        planId: junio, situacion: 'FINALIZADO', periodo: 'SEMESTRAL', asignado: 'Soporte TIC',
        semestrePlanificado: { etiqueta: 'S1-2025' }, semestreReal: { etiqueta: 'S2-2025' },
        tecnico: 'jperez', estadoEquipo: 'OPERATIVO', evidencia: 'Informe MT-2025-01',
      });
      expect(r.data.find((f: { clave: string }) => f.clave === `P-${predictivo}`)).toMatchObject({ situacion: 'SIN_EJECUCION', mantenimientoId: null, fechaInicio: null });
    });

    it('filtros por situación, activo, tipo y responsable', async () => {
      expect((await especifica('anio=2025&semestre=1&situacion=FINALIZADO')).meta.total).toBe(3);
      expect((await especifica('anio=2025&semestre=1&situacion=SIN_EJECUCION')).meta.total).toBe(2);
      expect((await especifica('anio=2025&semestre=1&situacion=CANCELADO')).meta.total).toBe(1);
      expect((await especifica(`anio=2025&activoId=${app1}`)).meta.total).toBe(2);
      const pred = await especifica('anio=2025&tipo=PREDICTIVO');
      expect(pred.data.map((f: { clave: string }) => f.clave)).toEqual([`P-${predictivo}`]);
      expect((await especifica('anio=2025&responsable=jperez')).meta.total).toBe(3);
      expect((await especifica('anio=2025&semestre=2')).meta.total).toBe(1);
    });

    it('paginación estable: páginas sin repetidos que cubren el total', async () => {
      const paginas = await Promise.all([1, 2, 3].map((p) => especifica(`anio=2025&semestre=1&limit=2&page=${p}`)));
      expect(paginas[0].meta).toEqual({ total: 6, page: 1, limit: 2, totalPages: 3 });
      const claves = paginas.flatMap((p) => p.data.map((f: { clave: string }) => f.clave));
      expect(new Set(claves).size).toBe(6);
    });

    it('parámetros inválidos → 400', async () => {
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/especifica?semestre=1').expect(400);
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/especifica?situacion=ABIERTO').expect(400);
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/especifica?limit=500').expect(400);
    });
  });

  describe('15 · un activo desactivado en GLPI conserva su historial de mantenimiento', () => {
    it('papelera de GLPI: no admite ejecuciones nuevas, pero planificaciones, ejecuciones y bitácoras siguen', async () => {
      const antes = (await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025').expect(200)).body;
      const ejecucionesAntes = await prisma.mantenimiento.count({ where: { activoId: pc } });
      // Lo que hace la sincronización al ver el equipo en la papelera de GLPI (ver sincronizacion.e2e-spec.ts).
      await prisma.activo.update({ where: { id: pc }, data: { inactivoDesde: new Date(), motivoInactivo: 'PAPELERA_GLPI' } });

      const res = await api(tokens.analista).post('/api/mantenimientos', { planId: correctivo, fecha: dia('2025-09-01'), fechaLimite: dia('2025-09-05') }).expect(400);
      expect(res.body.message).toMatch(/papelera de GLPI/);
      expect(await prisma.mantenimiento.count({ where: { activoId: pc } })).toBe(ejecucionesAntes);
      await api(tokens.auditor).get(`/api/mantenimientos/${ejecucionJulio}`).expect(200);
      await api(tokens.auditor).get(`/api/mantenimientos/planes/${junio}`).expect(200);
      const despues = (await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025').expect(200)).body;
      expect(despues).toEqual(antes);

      await prisma.activo.update({ where: { id: pc }, data: { inactivoDesde: null, motivoInactivo: null } });
    });
  });

  describe('16 · permisos', () => {
    it('el auditor consulta las bitácoras pero no planifica, ejecuta ni corrige → 403', async () => {
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/general?anio=2025').expect(200);
      await api(tokens.auditor).get('/api/mantenimientos/bitacora/especifica').expect(200);
      await api(tokens.auditor)
        .post('/api/mantenimientos/planes', { tipo: 'PREVENTIVO', frecuencia: 'UNICA', fechaInicio: dia('2025-10-01'), responsable: 'X', actividades: 'Revisión general del equipo.', activoIds: [pc] })
        .expect(403);
      await api(tokens.auditor).post('/api/mantenimientos', { planId: correctivo, fecha: dia('2025-09-01') }).expect(403);
      await api(tokens.auditor).patch(`/api/mantenimientos/${ejecucionJulio}/ejecucion`, { observaciones: 'X', motivoCambio: MOTIVO }).expect(403);
    });

    it('sin token → 401', async () => {
      await request(app.getHttpServer()).get('/api/mantenimientos/bitacora/general?anio=2025').expect(401);
    });

    it('el analista corrige lo ejecutado mientras está en ejecución (no la descripción ni la condición)', async () => {
      const { id } = await ejecutar(correctivo, dia('2025-09-01'), dia('2025-09-05'));
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: dia('2025-09-02') }).expect(200);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/ejecucion`, { estadoEquipo: 'OPERATIVO', motivoCambio: MOTIVO }).expect(400);
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/ejecucion`, { tecnico: 'mlopez', fechaInicio: dia('2025-09-03'), motivoCambio: MOTIVO })
        .expect(200);
      expect(res.body).toMatchObject({ tecnico: 'mlopez', fechaInicio: dia('2025-09-03'), fase: 'EN_EJECUCION' });
      // Una pendiente no tiene nada ejecutado que corregir.
      const pendiente = await ejecutar(correctivo, dia('2025-09-10'), dia('2025-09-12'));
      await api(tokens.analista).patch(`/api/mantenimientos/${pendiente.id}/ejecucion`, { tecnico: 'x', motivoCambio: MOTIVO }).expect(409);
    });
  });
});
