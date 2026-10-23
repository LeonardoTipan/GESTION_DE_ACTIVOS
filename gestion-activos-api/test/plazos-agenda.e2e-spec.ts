/**
 * Pruebas e2e de PLAZOS y AGENDA en los tres módulos: intervalos previstos,
 * fechas reales, excepciones (solo admin, con justificación), ampliaciones
 * formales, ventana propia de la capa 3 y calendarios que reflejan lo guardado
 * en MySQL (gestion_activos_test).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 120_000;
const HORA = 3_600_000;
const DIA = 24 * HORA;
const iso = (ms: number) => new Date(ms).toISOString();
const ahora = Date.now();
const JUSTIFICACION = 'El equipo estuvo en uso continuo durante toda la ventana prevista.';
const MOTIVO = 'Ampliación aprobada por la jefatura de TIC (acta 12/2026).';

describe('Plazos previstos, fechas reales y agenda (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let categoriaId: number;
  let planId: number;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    categoriaId = (await prisma.categoria.create({ data: { nombre: 'Computadoras', descripcion: '' } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    activoId = (
      await prisma.activo.create({
        data: { codigo: 'PC-PLAZOS', nombre: 'PC de plazos', sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: false, ultimaRevision: new Date('2026-01-01'), categoriaId, criticidadId, estado: 'Malo' },
      })
    ).id;
    // Las ejecuciones nacen de una planificación.
    planId = (
      await prisma.planMantenimiento.create({
        data: { activoId, tipo: 'CORRECTIVO', frecuencia: 'UNICA', fechaInicio: new Date(ahora), responsable: 'Soporte', actividades: 'Cambio de fuente' },
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
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
    };
  };
  const agenda = async (modulo: string, capa: number, desde: number, hasta: number) =>
    (await api(tokens.auditor).get(`/api/${modulo}/agenda?capa=${capa}&desde=${iso(desde)}&hasta=${iso(hasta)}`).expect(200)).body as {
      clave: string; tipo: string; estado: string; inicio: string; fin: string | null; fueraDePlazo: boolean; capa: number; activo: { categoriaId: number };
    }[];

  describe('Mantenimientos', () => {
    const programar = (fecha: number, fechaLimite: number) =>
      api(tokens.analista).post('/api/mantenimientos', { planId, fecha: iso(fecha), fechaLimite: iso(fechaLimite) });

    it('la fecha límite no puede ser anterior al inicio previsto → 400', async () => {
      const res = await programar(ahora + DIA, ahora).expect(400);
      expect(res.body.message).toMatch(/límite no puede ser anterior/);
    });

    it('iniciar dentro del intervalo → 200, sin excepción; la fecha real se guarda tal cual', async () => {
      const { id } = (await programar(ahora - 2 * HORA, ahora + DIA).expect(201)).body;
      const real = iso(ahora - HORA);
      const res = await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: real }).expect(200);
      expect(res.body).toMatchObject({ fase: 'EN_EJECUCION', fueraDePlazo: false, fechaInicio: real });
      expect((await prisma.mantenimiento.findUniqueOrThrow({ where: { id } })).fecha.toISOString()).toBe(iso(ahora - 2 * HORA));
    });

    it('fuera del intervalo: 409 sin justificación, 403 para el analista, 200 para el admin (excepción registrada)', async () => {
      const { id } = (await programar(ahora + DIA, ahora + 3 * DIA).expect(201)).body;
      // Fecha real: ahora, antes del inicio previsto (mañana).
      const fechaInicio = iso(ahora);
      const res = await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio }).expect(409);
      expect(res.body.message).toMatch(/fuera del intervalo previsto/);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio, motivoExcepcion: JUSTIFICACION }).expect(403);
      await api(tokens.admin).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio, motivoExcepcion: 'corto' }).expect(400);
      const ok = await api(tokens.admin).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio, motivoExcepcion: JUSTIFICACION }).expect(200);
      expect(ok.body).toMatchObject({ fueraDePlazo: true, motivoExcepcion: JUSTIFICACION, excepcionPor: 'admin.test' });
      // El plan no se toca: el inicio previsto sigue siendo mañana.
      expect(ok.body.fecha).toBe(iso(ahora + DIA));
    });

    it('ampliar el plazo: solo admin, con motivo; se conserva el límite original y queda la traza', async () => {
      const { id } = (await programar(ahora - DIA, ahora + DIA).expect(201)).body;
      const nuevo = iso(ahora + 5 * DIA);
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/plazo`, { campo: 'EJECUCION', nuevoLimite: nuevo, motivo: MOTIVO }).expect(403);
      await api(tokens.admin).patch(`/api/mantenimientos/${id}/plazo`, { campo: 'EJECUCION', nuevoLimite: iso(ahora), motivo: MOTIVO }).expect(400);
      const res = await api(tokens.admin).patch(`/api/mantenimientos/${id}/plazo`, { campo: 'EJECUCION', nuevoLimite: nuevo, motivo: MOTIVO }).expect(200);
      expect(res.body).toMatchObject({ fechaLimite: nuevo, fechaLimiteOriginal: iso(ahora + DIA) });
      const trazas = await api(tokens.auditor).get(`/api/trazas?entidad=MANTENIMIENTO&registroId=${id}`).expect(200);
      expect(trazas.body[0].motivo).toContain('Ampliación del plazo de ejecución');
    });

    it('capa 3: verificación con su propia ventana (distinta de la ejecución), fuera de ella exige excepción', async () => {
      const { id } = (await programar(ahora - 3 * DIA, ahora - 2 * DIA).expect(201)).body;
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: iso(ahora - 3 * DIA + HORA), tecnico: 'jperez' }).expect(200);
      // Fin el día previsto; la verificación se programa para DESPUÉS del límite de la ejecución.
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          fechaFin: iso(ahora - 3 * DIA + 3 * HORA), resultado: 'Fuente cambiada.', estadoEquipo: 'OPERATIVO', diagnostico: 'Fuente quemada.', duracionMin: 120,
          verificacionPrevista: iso(ahora - DIA), verificacionLimite: iso(ahora + DIA),
        })
        .expect(200);
      // Una ventana ya programada y sin usar es plan: el analista no la mueve (403); el admin sí, con un intervalo válido.
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/verificacion-prevista`, { prevista: iso(ahora - DIA), limite: iso(ahora + 2 * DIA) }).expect(403);
      await api(tokens.admin).patch(`/api/mantenimientos/${id}/verificacion-prevista`, { prevista: iso(ahora - DIA), limite: iso(ahora - 2 * DIA) }).expect(400);
      // Fuera de su ventana (antes de la prevista) → 409.
      await api(tokens.analista)
        .post(`/api/mantenimientos/${id}/verificaciones`, { fecha: iso(ahora - 2 * DIA), resultado: 'OPERATIVO', observaciones: 'Equipo enciende bien.', evidencia: 'Acta 1', responsable: 'Supervisor' })
        .expect(409);
      const v = await api(tokens.analista)
        .post(`/api/mantenimientos/${id}/verificaciones`, { fecha: iso(ahora - HORA), resultado: 'OPERATIVO', observaciones: 'Equipo enciende bien.', evidencia: 'Acta 1', responsable: 'Supervisor' })
        .expect(201);
      expect(v.body.fueraDePlazo).toBe(false);

      // Agenda: previsto y real son eventos distintos, con las fechas guardadas.
      const capa2 = await agenda('mantenimientos', 2, ahora - 5 * DIA, ahora + DIA);
      const real = capa2.find((e) => e.clave === `m2r-${id}`)!;
      expect(real).toMatchObject({ tipo: 'REAL', estado: 'COMPLETADO', inicio: iso(ahora - 3 * DIA + HORA), fin: iso(ahora - 3 * DIA + 3 * HORA) });
      // El mantenimiento tiene solo dos fases: la agenda no tiene capa de verificación.
      expect(await agenda('mantenimientos', 3, ahora - 5 * DIA, ahora + DIA)).toEqual([]);
    }, LENTO);

    it('tras una verificación que no lo cierra, el analista programa la siguiente (la ventana ya se usó)', async () => {
      const { id } = (await programar(ahora - 3 * DIA, ahora - 2 * DIA).expect(201)).body;
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: iso(ahora - 3 * DIA + HORA), tecnico: 'jperez' }).expect(200);
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          fechaFin: iso(ahora - 3 * DIA + 2 * HORA), resultado: 'Fuente cambiada.', estadoEquipo: 'DEGRADADO', diagnostico: 'Fuente quemada.', duracionMin: 60,
          verificacionPrevista: iso(ahora - 2 * DIA), verificacionLimite: iso(ahora - DIA),
        })
        .expect(200);
      await api(tokens.analista)
        .post(`/api/mantenimientos/${id}/verificaciones`, { fecha: iso(ahora - 2 * DIA + HORA), resultado: 'NO_SATISFACTORIO', observaciones: 'Sigue reiniciándose.', responsable: 'Supervisor' })
        .expect(201);
      const res = await api(tokens.analista).patch(`/api/mantenimientos/${id}/verificacion-prevista`, { prevista: iso(ahora - HORA), limite: iso(ahora + DIA) }).expect(200);
      expect(res.body).toMatchObject({ verificacionPrevista: iso(ahora - HORA), verificacionLimite: iso(ahora + DIA), cierre: 'NO_SATISFACTORIO' });
    }, LENTO);

    it('agenda: lo no iniciado es PREVISTO (no completado), vencido al pasar el límite; filtra por categoría', async () => {
      const { id } = (await programar(ahora - 4 * DIA, ahora - 3 * DIA).expect(201)).body;
      const capa1 = await agenda('mantenimientos', 1, ahora - 10 * DIA, ahora + 10 * DIA);
      expect(capa1.find((e) => e.clave === `m1-${id}`)).toMatchObject({ tipo: 'PREVISTO', estado: 'VENCIDO', inicio: iso(ahora - 4 * DIA), fin: iso(ahora - 3 * DIA) });
      const otraCategoria = (await api(tokens.auditor).get(`/api/mantenimientos/agenda?desde=${iso(ahora - 10 * DIA)}&hasta=${iso(ahora + 10 * DIA)}&categoriaId=999999`).expect(200)).body;
      expect(otraCategoria).toEqual([]);
    });

    it('un plan genera el intervalo de cada intervención con su plazo, cruzando de año, sin duplicar al programar', async () => {
      const proxima = '2026-12-30T13:00:00.000Z';
      const [plan] = (
        await api(tokens.analista)
          .post('/api/mantenimientos/planes', { tipo: 'PREVENTIVO', frecuencia: 'MENSUAL', fechaInicio: proxima, plazoDias: 5, responsable: 'Soporte', actividades: 'Revisión mensual del equipo.', activoIds: [activoId] })
          .expect(201)
      ).body;
      const eventos = await agenda('mantenimientos', 1, Date.parse('2026-12-01T00:00:00Z'), Date.parse('2027-02-28T00:00:00Z'));
      const delPlan = eventos.filter((e) => e.clave.startsWith(`p1-${plan.id}-`));
      expect(delPlan.map((e) => [e.inicio.slice(0, 10), e.fin?.slice(0, 10)])).toEqual([
        ['2026-12-30', '2027-01-04'],
        ['2027-01-30', '2027-02-04'],
      ]);
      const p = await api(tokens.analista).post(`/api/mantenimientos/planes/${plan.id}/programar`).expect(201);
      const m = await prisma.mantenimiento.findUniqueOrThrow({ where: { id: p.body.mantenimientoId } });
      expect([m.fecha.toISOString(), m.fechaLimite?.toISOString()]).toEqual([proxima, '2027-01-04T13:00:00.000Z']);
      expect(await prisma.mantenimiento.count({ where: { planId: plan.id } })).toBe(1);
    });
  });

  describe('Respaldos', () => {
    let planId: number;
    let ejecucionId: number;
    const noche = (diasAtras: number) => `${iso(ahora - diasAtras * DIA).slice(0, 10)}T03:30:00.000Z`; // 22:30 en Quito
    const ejecucion = (extra: object = {}) => ({
      planId, fecha: noche(2), tipo: 'COMPLETO', medio: 'DISCO_A_DISCO', volumenGb: 10, duracionMin: 30, rpoHoras: 24,
      resultado: 'EXITOSO', responsable: 'Infraestructura', cifrado: true, fueraDePlazo: undefined, fueraSitio: true, inmutable: false, integridad: true, ...extra,
    });

    beforeAll(async () => {
      [{ id: planId }] = (
        await api(tokens.analista)
          .post('/api/respaldos/planes', {
            frecuencia: 'DIARIO', tipo: 'COMPLETO', medio: 'DISCO_A_DISCO', ventana: 'NOCTURNA_22_02', retencion: 'DIAS_90', frecuenciaPrueba: 'MENSUAL',
            rpoHoras: 24, rtoMinutos: 240, responsable: 'Infraestructura', justificacion: 'Servidor con información institucional.', vigenteDesde: iso(ahora - 10 * DIA).slice(0, 10), activoIds: [activoId],
          })
          .expect(201)
      ).body;
    }, LENTO);

    it('ejecución en la ventana nocturna → 201; la misma corrida otra vez → 409', async () => {
      const { fueraDePlazo: _, ...cuerpo } = ejecucion();
      const res = await api(tokens.analista).post('/api/respaldos/ejecuciones', cuerpo).expect(201);
      expect(res.body).toMatchObject({ fecha: noche(2), fueraDePlazo: false });
      ejecucionId = res.body.id;
      await api(tokens.analista).post('/api/respaldos/ejecuciones', cuerpo).expect(409);
    });

    it('fuera de la ventana horaria: 409; excepción solo de admin y justificada', async () => {
      const { fueraDePlazo: _, ...cuerpo } = ejecucion({ fecha: `${iso(ahora - DIA).slice(0, 10)}T17:00:00.000Z` }); // 12:00 en Quito
      const res = await api(tokens.analista).post('/api/respaldos/ejecuciones', cuerpo).expect(409);
      expect(res.body.message).toMatch(/fuera de la ventana nocturna/);
      await api(tokens.analista).post('/api/respaldos/ejecuciones', { ...cuerpo, motivoExcepcion: JUSTIFICACION }).expect(403);
      const ok = await api(tokens.admin).post('/api/respaldos/ejecuciones', { ...cuerpo, motivoExcepcion: JUSTIFICACION }).expect(201);
      expect(ok.body).toMatchObject({ fueraDePlazo: true, excepcionPor: 'admin.test' });
    });

    it('prueba de restauración programada: exige su ventana, una sola, y su plazo propio (al día siguiente de la copia)', async () => {
      const prueba = { ejecucionId, fecha: iso(ahora - HORA), motivo: 'PRUEBA_PROGRAMADA', resultado: 'EXITOSO', tiempoRealMin: 60, rtoMinutos: 240, integridad: true, evidencia: 'Acta PR-1', responsable: 'Infraestructura' };
      await api(tokens.analista).post('/api/respaldos/restauraciones', prueba).expect(409);
      await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${ejecucionId}/prueba`, { prevista: iso(ahora - DIA), limite: iso(ahora + DIA) }).expect(200);
      const r = await api(tokens.analista).post('/api/respaldos/restauraciones', prueba).expect(201);
      expect(r.body.fueraDePlazo).toBe(false);
      await api(tokens.analista).post('/api/respaldos/restauraciones', prueba).expect(409);
      // Restauración real por incidente: no está programada ni exige ventana.
      await api(tokens.analista).post('/api/respaldos/restauraciones', { ...prueba, motivo: 'INCIDENTE_DISPONIBILIDAD' }).expect(201);
      // Ampliar el plazo de la prueba: solo admin.
      await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${ejecucionId}/plazo-prueba`, { nuevoLimite: iso(ahora + 3 * DIA), motivo: MOTIVO }).expect(403);
      await api(tokens.admin).patch(`/api/respaldos/ejecuciones/${ejecucionId}/plazo-prueba`, { nuevoLimite: iso(ahora + 3 * DIA), motivo: MOTIVO }).expect(200);
    });

    it('modificar la fecha de una ejecución no salta el plan: fuera de la ventana solo el admin, y el motivo del cambio es la justificación', async () => {
      const { fueraDePlazo: _, ...cuerpo } = ejecucion({ fecha: noche(3) });
      const { id } = (await api(tokens.analista).post('/api/respaldos/ejecuciones', cuerpo).expect(201)).body;
      const motivoCambio = 'La hora se copió mal del registro del software de respaldo.';
      const mediodia = `${iso(ahora - 3 * DIA).slice(0, 10)}T17:00:00.000Z`; // 12:00 en Quito
      await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${id}`, { fecha: mediodia, motivoCambio }).expect(403);
      // Otros datos sin tocar la fecha: no se reevalúa.
      await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${id}`, { volumenGb: 12, motivoCambio }).expect(200);
      const ok = await api(tokens.admin).patch(`/api/respaldos/ejecuciones/${id}`, { fecha: mediodia, motivoCambio }).expect(200);
      expect(ok.body).toMatchObject({ fecha: mediodia, fueraDePlazo: true, motivoExcepcion: motivoCambio, excepcionPor: 'admin.test' });
      // Devuelta a la ventana deja de ser excepción (la anterior queda en las trazas).
      const vuelta = await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${id}`, { fecha: noche(3), motivoCambio }).expect(200);
      expect(vuelta.body).toMatchObject({ fueraDePlazo: false, motivoExcepcion: null });
      await api(tokens.admin).post(`/api/respaldos/ejecuciones/${id}/anular`, { motivo: 'Registro de prueba de modificación de fechas.' }).expect(200);
    });

    it('una prueba de restauración ya programada solo la reprograma un admin; una restauración no se convierte en una segunda prueba', async () => {
      await api(tokens.analista).patch(`/api/respaldos/ejecuciones/${ejecucionId}/prueba`, { prevista: iso(ahora - DIA), limite: iso(ahora + 4 * DIA) }).expect(403);
      await api(tokens.admin).patch(`/api/respaldos/ejecuciones/${ejecucionId}/prueba`, { prevista: iso(ahora - DIA), limite: iso(ahora + 4 * DIA) }).expect(200);
      const incidente = (await prisma.restauracion.findFirstOrThrow({ where: { ejecucionId, motivo: 'INCIDENTE_DISPONIBILIDAD' } })).id;
      await api(tokens.admin)
        .patch(`/api/respaldos/restauraciones/${incidente}`, { motivo: 'PRUEBA_PROGRAMADA', motivoCambio: 'Se registró con un motivo equivocado en el formulario.' })
        .expect(409);
    });

    it('agenda: ventanas previstas, ejecuciones reales y restauraciones como eventos distintos', async () => {
      const capa1 = await agenda('respaldos', 1, ahora - 3 * DIA, ahora);
      expect(capa1.every((e) => e.tipo === 'PREVISTO')).toBe(true);
      expect(capa1.filter((e) => e.estado === 'COMPLETADO').length).toBeGreaterThan(0);
      const capa2 = await agenda('respaldos', 2, ahora - 3 * DIA, ahora);
      expect(capa2.find((e) => e.clave === `r2r-${ejecucionId}`)).toMatchObject({ tipo: 'REAL', inicio: noche(2) });
      const capa3 = await agenda('respaldos', 3, ahora - 3 * DIA, ahora);
      expect(capa3.filter((e) => e.tipo === 'REAL')).toHaveLength(2);
      expect(capa3.some((e) => e.clave === `r3p-${ejecucionId}`)).toBe(false); // la prueba programada ya se hizo
    });
  });

  describe('Vulnerabilidades (dos fases)', () => {
    let id: number;

    beforeAll(async () => {
      id = (
        await api(tokens.analista)
          .post('/api/vulnerabilidades', { activoId, descripcion: 'Servicio expuesto sin parche.', nivelRiesgo: 'ALTO', responsable: 'Seguridad', fecha: iso(ahora - 5 * DIA), fechaLimite: iso(ahora - DIA) })
          .expect(201)
      ).body.id;
    }, LENTO);

    it('el plazo no puede ser anterior a la detección', async () => {
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}`, { fechaLimite: iso(ahora - 6 * DIA), motivoCambio: MOTIVO }).expect(400);
    });

    it('agenda: detección (real), plazo (previsto, vencido) y remediación (real) son eventos distintos; sin capa 3', async () => {
      let capa1 = await agenda('vulnerabilidades', 1, ahora - 10 * DIA, ahora + 10 * DIA);
      expect(capa1.find((e) => e.clave === `v1d-${id}`)).toMatchObject({ tipo: 'REAL', inicio: iso(ahora - 5 * DIA) });
      expect(capa1.find((e) => e.clave === `v1l-${id}`)).toMatchObject({ tipo: 'PREVISTO', inicio: iso(ahora - DIA), estado: 'VENCIDO' });
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/remediar`, { fechaRemediacion: iso(ahora - 2 * HORA), evidencia: 'Informe 1', repositorioVerificable: 'Carpeta TIC' })
        .expect(200);
      const capa2 = await agenda('vulnerabilidades', 2, ahora - 10 * DIA, ahora + 10 * DIA);
      // Remediada después de su plazo: se marca fuera de plazo, con la fecha real.
      expect(capa2.find((e) => e.clave === `v2r-${id}`)).toMatchObject({ tipo: 'REAL', inicio: iso(ahora - 2 * HORA), estado: 'COMPLETADO', fueraDePlazo: true });
      capa1 = await agenda('vulnerabilidades', 1, ahora - 10 * DIA, ahora + 10 * DIA);
      expect(capa1.find((e) => e.clave === `v1l-${id}`)?.estado).toBe('COMPLETADO');
      expect(await agenda('vulnerabilidades', 3, ahora - 10 * DIA, ahora + 10 * DIA)).toEqual([]);
    });

    it('permisos: el auditor no amplía plazos', async () => {
      await api(tokens.auditor).patch(`/api/respaldos/ejecuciones/1/prueba`, { prevista: iso(ahora), limite: iso(ahora + DIA) }).expect(403);
      await api(tokens.auditor).patch(`/api/mantenimientos/1/plazo`, { campo: 'EJECUCION', nuevoLimite: iso(ahora + DIA), motivo: MOTIVO }).expect(403);
    });
  });
});
