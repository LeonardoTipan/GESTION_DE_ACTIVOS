/**
 * Vulnerabilidades: caso controlado de detección → remediación de punta a punta (los 12 pasos
 * del 06/11/2026) y Bitácora General trimestral / Específica. Base gestion_activos_test.
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
// Hora de Ecuador (UTC−5): T1 = ene–mar, T2 = abr–jun de 2026.
const DETECCION_T1 = '2026-03-20T15:00:00.000Z';
const LIMITE = '2026-04-30T22:00:00.000Z';
const INICIO = '2026-04-02T14:00:00.000Z';
const REMEDIACION_T2 = '2026-05-02T15:00:00.000Z';

interface Periodo { clave: string; numerador: number | null; denominador: number | null; porcentaje: number | null; situacion: string }
interface Bitacora { indicador: { frecuencia: string; formula: string }; periodos: Periodo[]; informativas: { etiqueta: string; valores: (number | null)[] }[] }

describe('Vulnerabilidades: caso controlado y Bitácora trimestral (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let servidor: number;
  let otro: number;

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
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'Infraestructura', ubicacion: 'Data center', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, categoriaId: hw.id };
    // Condición física «Malo»: la informa GLPI; remediar NO debe cambiarla.
    servidor = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-V6', nombre: 'SERVIDOR V6', estado: 'Malo' } })).id;
    otro = (await prisma.activo.create({ data: { ...base, codigo: 'SRV-V7', nombre: 'SERVIDOR V7', estado: 'Bueno' } })).id;
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
  const general = async (anio = 2026) => (await api(tokens.auditor).get(`/api/vulnerabilidades/bitacora/general?anio=${anio}`).expect(200)).body as Bitacora;
  const ids = (body: { data: { id: number }[] }) => body.data.map((v) => v.id);

  let id: number;

  describe('Caso controlado: detección → remediación', () => {
    it('1–3 · se detecta en un activo existente, en ABIERTO', async () => {
      const r = await api(tokens.analista)
        .post('/api/vulnerabilidades', { activoId: servidor, fecha: DETECCION_T1, fechaLimite: LIMITE, descripcion: 'OpenSSL vulnerable', nivelRiesgo: 'ALTO', responsable: 'ANALISTA 1' })
        .expect(201);
      id = r.body.id;
      expect(r.body).toMatchObject({ estado: 'ABIERTO', fechaRemediacion: null, activo: { codigo: 'SRV-V6' } });
    });

    it('4–5 · se abre la remediación (EN_PROGRESO) y se refleja en el listado y en pendientes', async () => {
      await api(tokens.analista).patch(`/api/vulnerabilidades/${id}/iniciar`, { fechaInicio: INICIO }).expect(200);
      const pend = await api(tokens.auditor).get('/api/vulnerabilidades?abiertas=true').expect(200);
      expect(pend.body.data.find((v: { id: number }) => v.id === id)).toMatchObject({ estado: 'EN_PROGRESO' });
    });

    it('6 · guardar la fecha sin cerrar NO la remedia ni la cuenta como remediada', async () => {
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/remediacion`, { fechaRemediacion: REMEDIACION_T2, evidencia: 'Informe de remediación 01' })
        .expect(200);
      const v = (await api(tokens.auditor).get(`/api/vulnerabilidades/${id}`).expect(200)).body;
      expect(v).toMatchObject({ estado: 'EN_PROGRESO', fechaRemediacion: REMEDIACION_T2 });
      const b = await general();
      expect(b.periodos[1]).toMatchObject({ numerador: 0, denominador: 1 });
      expect(ids((await api(tokens.auditor).get('/api/vulnerabilidades?estado=REMEDIADO').expect(200)).body)).not.toContain(id);
    });

    it('7 · se cierra la remediación con fecha real, verificable y repositorio', async () => {
      const r = await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/remediar`, {
          fechaRemediacion: REMEDIACION_T2,
          evidencia: 'Informe de remediación 01',
          repositorioVerificable: 'Carpeta Compartida TICs/Vulnerabilidades/2026',
          observacion: 'Se actualizó OpenSSL.',
        })
        .expect(200);
      expect(r.body).toMatchObject({ estado: 'REMEDIADO', fechaRemediacion: REMEDIACION_T2, cerradaPor: 'analista.test' });
    });

    it('8–9 · ficha, listado de remediadas (una sola vez) y fuera de pendientes', async () => {
      const remediadas = (await api(tokens.auditor).get('/api/vulnerabilidades?estado=REMEDIADO').expect(200)).body;
      expect(ids(remediadas).filter((x) => x === id)).toHaveLength(1);
      expect(ids((await api(tokens.auditor).get('/api/vulnerabilidades?abiertas=false').expect(200)).body)).toContain(id);
      expect(ids((await api(tokens.auditor).get('/api/vulnerabilidades?abiertas=true').expect(200)).body)).not.toContain(id);
      const todas = (await api(tokens.auditor).get('/api/vulnerabilidades').expect(200)).body;
      expect(ids(todas).filter((x) => x === id)).toHaveLength(1);
    });

    it('10 · Bitácora: identificada en T1 (pendiente) y remediada en T2; la específica lo justifica', async () => {
      const b = await general();
      expect(b.indicador).toMatchObject({ frecuencia: 'TRIMESTRAL', formula: 'Vulnerabilidades remediadas / Total Identificados' });
      expect(b.periodos[0]).toMatchObject({ clave: '2026-T1', numerador: 0, denominador: 1, porcentaje: 0 });
      expect(b.periodos[1]).toMatchObject({ clave: '2026-T2', numerador: 1, denominador: 1, porcentaje: 100 });
      expect(b.periodos[2]).toMatchObject({ numerador: 0, denominador: 0, porcentaje: null });
      expect(b.informativas.find((f) => f.etiqueta === 'Remediadas fuera de plazo')!.valores[1]).toBe(1);
      const t1 = (await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?anio=2026&trimestre=1').expect(200)).body;
      expect(t1.data).toEqual([expect.objectContaining({ id, enIndicador: 'PENDIENTE' })]);
      const t2 = (await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?anio=2026&trimestre=2').expect(200)).body;
      expect(t2.data).toEqual([expect.objectContaining({ id, enIndicador: 'REMEDIADA', evidencia: 'Informe de remediación 01' })]);
      expect((await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?anio=2026&trimestre=3').expect(200)).body.meta.total).toBe(0);
    });

    it('10 · la auditoría conserva la detección y la remediación, con quién las hizo', async () => {
      const t = (await api(tokens.auditor).get(`/api/trazas?entidad=VULNERABILIDAD&registroId=${id}`).expect(200)).body as { responsable: string; cambios: { campo: string; despues: unknown }[] }[];
      const estados = t.flatMap((x) => x.cambios.filter((c) => c.campo === 'estado').map((c) => c.despues));
      expect(estados).toEqual(expect.arrayContaining(['ABIERTO', 'EN_PROGRESO', 'REMEDIADO']));
      expect(t.every((x) => x.responsable === 'analista.test')).toBe(true);
    });

    it('11 · la condición física del activo (informada por GLPI) no cambia', async () => {
      expect((await prisma.activo.findUniqueOrThrow({ where: { id: servidor } })).estado).toBe('Malo');
    });

    it('12 · calendario y panel reflejan el estado remediado', async () => {
      const ev = (await api(tokens.auditor).get('/api/vulnerabilidades/agenda?desde=2026-01-01T00:00:00Z&hasta=2026-12-31T00:00:00Z').expect(200)).body as { clave: string; estado: string }[];
      expect(ev.find((e) => e.clave === `v2r-${id}`)).toMatchObject({ estado: 'COMPLETADO' });
      expect(ev.find((e) => e.clave === `v1l-${id}`)).toMatchObject({ estado: 'COMPLETADO' });
      expect(ev.find((e) => e.clave === `v2p-${id}`)).toBeUndefined();
      const panel = (await api(tokens.auditor).get('/api/dashboard/indicadores').expect(200)).body;
      expect(panel.vulnerabilidades).toMatchObject({ remediadas: 1, abiertas: 0, enProgreso: 0 });
    });
  });

  describe('Cálculo trimestral y exclusiones', () => {
    it('una pendiente se arrastra; una anulada no cuenta en ninguna parte', async () => {
      const arrastre = (await api(tokens.analista)
        .post('/api/vulnerabilidades', { activoId: otro, fecha: '2026-02-10T15:00:00.000Z', descripcion: 'Puerto expuesto', nivelRiesgo: 'MEDIO', responsable: 'TÉCNICO 2' })
        .expect(201)).body.id as number;
      const anulada = (await api(tokens.analista)
        .post('/api/vulnerabilidades', { activoId: otro, fecha: '2026-02-11T15:00:00.000Z', descripcion: 'Registro duplicado', nivelRiesgo: 'BAJO', responsable: 'TÉCNICO 2' })
        .expect(201)).body.id as number;
      await api(tokens.admin).post(`/api/vulnerabilidades/${anulada}/anular`, { motivo: 'Registro duplicado por error de captura.' }).expect(200);
      const b = await general();
      // T1: la remediada en T2 y la pendiente; T2 y T3: las dos siguen (una se remedia en T2).
      expect(b.periodos.slice(0, 3).map((p) => [p.numerador, p.denominador])).toEqual([[0, 2], [1, 2], [0, 1]]);
      const esp = (await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?anio=2026').expect(200)).body;
      expect(ids(esp)).toEqual(expect.arrayContaining([id, arrastre]));
      expect(ids(esp)).not.toContain(anulada);
    });

    it('filtros de la específica: estado, responsable y búsqueda por código', async () => {
      const q = (s: string) => api(tokens.auditor).get(`/api/vulnerabilidades/bitacora/especifica?anio=2026&${s}`).expect(200);
      expect(ids((await q('estado=REMEDIADO')).body)).toEqual([id]);
      expect(ids((await q('responsable=ANALISTA')).body)).toEqual([id]);
      expect((await q('q=SRV-V7')).body.data.every((v: { activo: { codigo: string } }) => v.activo.codigo === 'SRV-V7')).toBe(true);
    });

    it('valida el período y respeta los permisos (el auditor solo consulta)', async () => {
      await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?trimestre=2').expect(400);
      await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/especifica?anio=2026&trimestre=5').expect(400);
      await api(tokens.auditor).get('/api/vulnerabilidades/bitacora/general').expect(400);
      await api(tokens.auditor).patch(`/api/vulnerabilidades/${id}/reabrir`, { motivo: 'Intento de reapertura por un auditor.' }).expect(403);
    });

    it('al reabrir, vuelve a pendiente y deja de contar como remediada (lo anterior queda en la auditoría)', async () => {
      await api(tokens.admin).patch(`/api/vulnerabilidades/${id}/reabrir`, { motivo: 'El escaneo vuelve a detectar la versión vulnerable.' }).expect(200);
      const b = await general();
      expect(b.periodos[1]).toMatchObject({ numerador: 0, denominador: 2 });
      expect(ids((await api(tokens.auditor).get('/api/vulnerabilidades?abiertas=true').expect(200)).body)).toContain(id);
    });
  });
});
