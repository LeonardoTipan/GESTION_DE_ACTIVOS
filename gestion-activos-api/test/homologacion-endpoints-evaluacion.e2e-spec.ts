/**
 * Homologación de Protección de Endpoints y Evaluación de Sistemas Productivos (06/11/2026):
 * activos reales del inventario, período derivado de la fecha planificada, detalle por equipo
 * de Endpoints (totales calculados), responsable de la ejecución en Evaluación, «por ejecutar»
 * en el calendario y el panel. Contra MySQL (gestion_activos_test) y el Keycloak de desarrollo.
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

const LENTO = 30_000;
const RUTA = '/api/proteccion-endpoints/periodos';
const EV = '/api/evaluaciones-sistemas';
const MOTIVO = 'El inventario del mes tenía un equipo mal registrado: hay que corregirlo.';

describe('Homologación · Endpoints con detalle por equipo y Evaluación (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = {} as Record<'pcA' | 'pcB' | 'pcC' | 'pcBaja' | 'pcNoOperativo' | 'monitor' | 'aplicativo' | 'servidor' | 'monitores' | 'aplicativos' | 'computadoras', number>;

  const api = (token?: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object = {}) => auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) => auth(request(server).patch(url).send(body)),
    };
  };
  const [anioHoy, mesHoy] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  const mesAtras = (n: number) => {
    const t = anioHoy * 12 + (mesHoy - 1) - n;
    return { anio: Math.floor(t / 12), mes: (t % 12) + 1 };
  };
  const fechaDe = (m: { anio: number; mes: number }, dia = 15, hora = '12:00') =>
    new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${hora}:00-05:00`).toISOString();
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const abrir = async (n: number, dia = 15) => (await api(tokens.analista).post(RUTA, { fechaPlanificada: fechaDe(mesAtras(n), dia), responsable: 'Soporte TIC' }).expect(201)).body;
  const equipos = async (id: number) =>
    (await api(tokens.auditor).get(`${RUTA}/${id}/equipos`).expect(200)).body as Array<{ activoId: number; conAntivirus: boolean | null; activo: { codigo: string; categoria: string } }>;
  const trazas = async (entidad: string, id: number) =>
    (await api(tokens.auditor).get(`/api/trazas?entidad=${entidad}&registroId=${id}`).expect(200)).body as Array<{ accion: string; motivo: string; cambios: Array<{ campo: string; antes: unknown; despues: unknown }> }>;
  const MEDICION = { fechaEjecucion: enDias(-1), responsableEjecucion: 'Técnico de soporte', evidencia: 'Inventario de equipos.xlsx', repositorioVerificable: 'Carpeta Compartida TICs/Antivirus' };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const categoria = async (nombre: string, extra: object) => (await prisma.categoria.create({ data: { nombre, descripcion: '', ...extra } })).id;
    ids.computadoras = await categoria('Computadoras', { claseMantenimiento: 'HARDWARE', aplicaEndpoint: true });
    ids.monitores = await categoria('Monitores', { claseMantenimiento: 'HARDWARE' });
    ids.aplicativos = await categoria('Aplicativos', { claseMantenimiento: 'SOFTWARE', aplicaEvaluacion: true });
    const servidores = await categoria('Servidores virtuales', { aplicaEvaluacion: true });
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const base = { sistemas: '', custodio: 'TIC', ubicacion: 'Piso 2', cifrado: true, ultimaRevision: new Date('2026-01-01'), criticidadId, estado: 'Bueno' };
    const activo = async (codigo: string, categoriaId: number, extra: object = {}) =>
      (await prisma.activo.create({ data: { ...base, codigo, nombre: `Equipo ${codigo}`, categoriaId, ...extra } })).id;
    ids.pcA = await activo('PC-A', ids.computadoras);
    ids.pcB = await activo('PC-B', ids.computadoras);
    ids.pcC = await activo('PC-C', ids.computadoras);
    ids.pcBaja = await activo('PC-BAJA', ids.computadoras, { deletedAt: new Date() });
    ids.pcNoOperativo = await activo('PC-DESECHADO', ids.computadoras, { estado: 'Desechado' });
    ids.monitor = await activo('MON-1', ids.monitores);
    ids.aplicativo = await activo('APL-1', ids.aplicativos);
    ids.servidor = await activo('SRV-1', servidores);
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  describe('Protección de Endpoints · apertura con la fecha planificada', () => {
    it('deriva año, mes y semestre de la fecha; copia SOLO los equipos operativos de categorías con Endpoints', async () => {
      const m = mesAtras(2);
      const p = await abrir(2);
      expect(p).toMatchObject({ anio: m.anio, mes: m.mes, semestre: `S${m.mes <= 6 ? 1 : 2}-${m.anio}`, fechaPlanificada: fechaDe(m), conDetalle: true, equiposSinRegistrar: 3, estado: 'ABIERTO' });
      const lista = await equipos(p.id);
      expect(lista.map((e) => e.activo.codigo)).toEqual(['PC-A', 'PC-B', 'PC-C']); // ni la baja, ni el desechado, ni el monitor
      expect(lista.every((e) => e.conAntivirus === null && e.activo.categoria === 'Computadoras')).toBe(true);
      const alta = (await trazas('PERIODO_ENDPOINT', p.id))[0];
      expect(alta.cambios).toEqual(expect.arrayContaining([{ campo: 'equipos', antes: null, despues: 3 }]));
    }, LENTO);

    it('la fecha se interpreta en la hora de Ecuador: el 1 a las 21:00 del día anterior en Guayaquil es del mes anterior', async () => {
      const m = mesAtras(3);
      // 02:00 UTC del día 1 = 21:00 del último día del mes anterior en Guayaquil.
      const fecha = new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-01T02:00:00Z`).toISOString();
      const p = (await api(tokens.analista).post(RUTA, { fechaPlanificada: fecha, responsable: 'Soporte TIC' }).expect(201)).body;
      expect({ anio: p.anio, mes: p.mes }).toEqual(mesAtras(4));
    }, LENTO);

    it('duplicados: otro día del mismo mes → 409; dos aperturas simultáneas → una sola', async () => {
      const otroDia = await api(tokens.analista).post(RUTA, { fechaPlanificada: fechaDe(mesAtras(2), 28), responsable: 'X' }).expect(409);
      expect(otroDia.body.message).toMatch(/ya existe/);
      const m = mesAtras(5);
      const estados = (await Promise.all([3, 20].map((dia) => api(tokens.analista).post(RUTA, { fechaPlanificada: fechaDe(m, dia), responsable: 'Simultáneo' })))).map((r) => r.status).sort();
      expect(estados).toEqual([201, 409]);
      expect(await prisma.periodoEndpoint.count({ where: m })).toBe(1);
      expect(await prisma.periodoEndpointActivo.count({ where: { periodo: m } })).toBe(3);
    }, LENTO);
  });

  describe('Protección de Endpoints · registro por equipo y cierre', () => {
    let id: number;
    beforeAll(async () => {
      id = (await prisma.periodoEndpoint.findFirstOrThrow({ where: mesAtras(2) })).id;
    });

    it('los totales no se escriben a mano; un activo ajeno al período se rechaza', async () => {
      const manual = await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { totalActivos: 10, equiposConAntivirus: 9 }).expect(400);
      expect(manual.body.message).toContain('se calculan del detalle');
      await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.monitor, conAntivirus: true }] }).expect(400);
      await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.pcA, conAntivirus: 'sí' }] }).expect(400);
    }, LENTO);

    it('guardar avance: calcula total, con antivirus, sin antivirus y cobertura; cada equipo queda en la auditoría', async () => {
      const res = await api(tokens.analista)
        .patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.pcA, conAntivirus: true }, { activoId: ids.pcB, conAntivirus: false }] })
        .expect(200);
      expect(res.body).toMatchObject({ estado: 'EN_PROGRESO', totalActivos: 3, equiposConAntivirus: 1, equiposSinAntivirus: 2, cobertura: 33.3, equiposSinRegistrar: 1 });
      const t = (await trazas('PERIODO_ENDPOINT', id))[0];
      expect(t.cambios).toEqual(expect.arrayContaining([
        { campo: 'Equipo PC-A', antes: null, despues: 'Con antivirus' },
        { campo: 'Equipo PC-B', antes: null, despues: 'Sin antivirus' },
        { campo: 'totalActivos', antes: null, despues: 3 },
      ]));
      // Un intercambio no cambia los totales, pero sí queda en la auditoría.
      await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.pcA, conAntivirus: false }, { activoId: ids.pcB, conAntivirus: true }] }).expect(200);
      const cambio = (await trazas('PERIODO_ENDPOINT', id))[0];
      expect(cambio.cambios.map((c) => c.campo).sort()).toEqual(['Equipo PC-A', 'Equipo PC-B']);
      // Sin ningún cambio: 400, como en el resto del aplicativo.
      await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.pcA, conAntivirus: false }] }).expect(400);
    }, LENTO);

    it('cerrar exige registrar TODOS los equipos (dice cuáles faltan) y los datos de la medición', async () => {
      const falta = await api(tokens.analista).patch(`${RUTA}/${id}/cerrar`, MEDICION).expect(400);
      expect(falta.body.message).toBe('Para cerrar el período falta registrar el antivirus de 1 equipo(s): PC-C.');
      const sinMedicion = await api(tokens.analista).patch(`${RUTA}/${id}/cerrar`, { equipos: [{ activoId: ids.pcC, conAntivirus: true }] }).expect(400);
      expect(sinMedicion.body.message).toContain('la fecha real de la medición');
      const res = await api(tokens.analista).patch(`${RUTA}/${id}/cerrar`, { ...MEDICION, equipos: [{ activoId: ids.pcC, conAntivirus: true }] }).expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', totalActivos: 3, equiposConAntivirus: 2, cobertura: 66.7, equiposSinRegistrar: 0, cerradoPor: 'analista.test' });
      await api(tokens.analista).patch(`${RUTA}/${id}/registro`, { equipos: [{ activoId: ids.pcC, conAntivirus: false }] }).expect(409);
    }, LENTO);

    it('reabrir: solo admin; conserva el detalle; el historial del activo sobrevive a su baja posterior', async () => {
      await api(tokens.analista).patch(`${RUTA}/${id}/reabrir`, { motivo: MOTIVO }).expect(403);
      await api(tokens.admin).patch(`${RUTA}/${id}/reabrir`, { motivo: MOTIVO }).expect(200);
      expect((await equipos(id)).map((e) => [e.activo.codigo, e.conAntivirus])).toEqual([['PC-A', false], ['PC-B', true], ['PC-C', true]]);
      // PC-A sale de GLPI (baja): su línea se conserva; un período nuevo ya no la incluye.
      await prisma.activo.update({ where: { id: ids.pcA }, data: { deletedAt: new Date() } });
      expect((await equipos(id)).map((e) => e.activo.codigo)).toContain('PC-A');
      const nuevo = await abrir(6);
      expect((await equipos(nuevo.id)).map((e) => e.activo.codigo)).toEqual(['PC-B', 'PC-C']);
      await prisma.activo.update({ where: { id: ids.pcA }, data: { deletedAt: null } });
      await api(tokens.analista).patch(`${RUTA}/${id}/cerrar`, {}).expect(200);
    }, LENTO);
  });

  describe('Protección de Endpoints · cambios del inventario después de abrir', () => {
    it('una computadora nueva en GLPI no cambia la lista ni el total del período; la diferencia se informa', async () => {
      const p = await abrir(10);
      const antes = (await equipos(p.id)).map((e) => e.activo.codigo);
      const base = await prisma.activo.findUniqueOrThrow({ where: { id: ids.pcB } });
      const nuevo = await prisma.activo.create({
        data: { codigo: 'PC-NUEVA', nombre: 'Equipo PC-NUEVA', categoriaId: ids.computadoras, criticidadId: base.criticidadId, sistemas: '', custodio: 'TIC', ubicacion: 'Piso 3', cifrado: true, ultimaRevision: new Date('2026-01-01'), estado: 'Bueno' },
      });
      expect((await equipos(p.id)).map((e) => e.activo.codigo)).toEqual(antes);
      const res = await api(tokens.analista).patch(`${RUTA}/${p.id}/registro`, { equipos: [{ activoId: ids.pcB, conAntivirus: true }] }).expect(200);
      expect(res.body.totalActivos).toBe(antes.length);
      await api(tokens.analista).patch(`${RUTA}/${p.id}/registro`, { equipos: [{ activoId: nuevo.id, conAntivirus: true }] }).expect(400);
      const c = (await api(tokens.auditor).get(`${RUTA}/${p.id}/comparacion-inventario`).expect(200)).body;
      expect(c).toMatchObject({ equiposPeriodo: antes.length, elegiblesHoy: antes.length + 1 });
      expect(c.nuevos.map((a: { codigo: string }) => a.codigo)).toEqual(['PC-NUEVA']);
      expect(c.yaNoElegibles).toEqual([]);
      // Y uno que deja de ser elegible (su estado pasa a «Desechado»): se conserva en el período y se informa.
      await prisma.activo.update({ where: { id: ids.pcC }, data: { estado: 'Desechado' } });
      const c2 = (await api(tokens.auditor).get(`${RUTA}/${p.id}/comparacion-inventario`).expect(200)).body;
      expect(c2.yaNoElegibles.map((a: { codigo: string }) => a.codigo)).toEqual(['PC-C']);
      expect((await equipos(p.id)).map((e) => e.activo.codigo)).toEqual(antes);
      await prisma.activo.update({ where: { id: ids.pcC }, data: { estado: 'Bueno' } });
      await prisma.activo.delete({ where: { id: nuevo.id } });
    }, LENTO);
  });

  describe('Protección de Endpoints · períodos anteriores al detalle', () => {
    it('sin detalle conservan los totales escritos a mano; «cargar equipos» solo una vez y solo pendientes', async () => {
      const antiguo = await prisma.periodoEndpoint.create({ data: { ...mesAtras(8), responsable: 'Histórico' } });
      expect((await api(tokens.auditor).get(`${RUTA}/${antiguo.id}`).expect(200)).body).toMatchObject({ conDetalle: false, equiposSinRegistrar: null, fechaPlanificada: null });
      await api(tokens.analista).patch(`${RUTA}/${antiguo.id}/registro`, { totalActivos: 20, equiposConAntivirus: 18 }).expect(200);
      await api(tokens.analista).patch(`${RUTA}/${antiguo.id}/registro`, { equipos: [{ activoId: ids.pcA, conAntivirus: true }] }).expect(400);
      await api(tokens.auditor).post(`${RUTA}/${antiguo.id}/equipos`).expect(403);
      const cargado = await api(tokens.analista).post(`${RUTA}/${antiguo.id}/equipos`).expect(201);
      expect(cargado.body).toMatchObject({ conDetalle: true, equiposSinRegistrar: 3 });
      expect((await trazas('PERIODO_ENDPOINT', antiguo.id))[0].cambios).toEqual([{ campo: 'equipos', antes: 0, despues: 3 }]);
      await api(tokens.analista).post(`${RUTA}/${antiguo.id}/equipos`).expect(409);
      const cerrado = await prisma.periodoEndpoint.create({ data: { ...mesAtras(9), responsable: 'Histórico', estado: 'CERRADO', totalActivos: 5, equiposConAntivirus: 5 } });
      await api(tokens.analista).post(`${RUTA}/${cerrado.id}/equipos`).expect(409);
      expect(await prisma.periodoEndpointActivo.count({ where: { periodoId: cerrado.id } })).toBe(0);
    }, LENTO);
  });

  describe('Protección de Endpoints · filtros, calendario y panel', () => {
    it('filtra por equipo (código o nombre) y por categoría', async () => {
      const conPcB = (await api(tokens.auditor).get(`${RUTA}?activo=PC-B&limit=100`).expect(200)).body;
      expect(conPcB.meta.total).toBeGreaterThan(0);
      expect((await api(tokens.auditor).get(`${RUTA}?categoriaId=${ids.monitores}`).expect(200)).body.meta.total).toBe(0);
      expect((await api(tokens.auditor).get(`${RUTA}?categoriaId=${ids.computadoras}&limit=100`).expect(200)).body.meta.total).toBe(conPcB.meta.total);
    }, LENTO);

    it('«por ejecutar»: abierto con la fecha pasada; el cerrado nunca; el evento usa la fecha planificada', async () => {
      const abierto = (await prisma.periodoEndpoint.findFirstOrThrow({ where: mesAtras(6) })).id;
      expect((await api(tokens.auditor).get(`${RUTA}/${abierto}`).expect(200)).body.porEjecutar).toBe(true);
      const eventos = (await api(tokens.auditor).get(`${RUTA}/agenda?desde=${enDias(-400)}&hasta=${enDias(40)}&capa=1`).expect(200)).body as Array<{ clave: string; estado: string; inicio: string; detalle: string; activo: unknown }>;
      const ev = eventos.find((e) => e.clave === `ep1-${abierto}`)!;
      expect(ev).toMatchObject({ estado: 'POR_EJECUTAR', inicio: fechaDe(mesAtras(6)), activo: null });
      expect(ev.detalle).toBe('2 equipo(s) (Computadoras) · Estado: Por ejecutar');
      const cerrado = (await prisma.periodoEndpoint.findFirstOrThrow({ where: mesAtras(2) })).id;
      expect(eventos.find((e) => e.clave === `ep1-${cerrado}`)!.estado).toBe('COMPLETADO');
      const porEjecutar = (await api(tokens.auditor).get(`${RUTA}?estado=ABIERTO&limit=100`).expect(200)).body.data.filter((p: { porEjecutar: boolean }) => p.porEjecutar).length;
      const panel = (await api(tokens.auditor).get('/api/dashboard/indicadores').expect(200)).body;
      expect(panel.endpoints.porEjecutar).toBe(porEjecutar);
    }, LENTO);
  });

  describe('Evaluación de Sistemas Productivos', () => {
    const planificar = (activoId: number, fecha: string) =>
      api(tokens.analista).post(EV, { activoId, fechaProgramadaProduccion: fecha, responsable: 'Seguridad TIC', descripcion: 'Versión 3: pruebas de autenticación.' });
    const INFORME = { fechaPruebas: enDias(-1), evidencia: 'Informe de seguridad.pdf', repositorioVerificable: 'Carpeta Compartida TICs/Seguridad' };

    it('solo activos de categorías con Evaluación; uno pendiente por sistema', async () => {
      const ajeno = await planificar(ids.monitor, enDias(10)).expect(400);
      expect(ajeno.body.message).toContain('no está habilitada para');
      await planificar(ids.aplicativo, enDias(10)).expect(201);
      await planificar(ids.aplicativo, enDias(20)).expect(409);
    }, LENTO);

    it('cerrar exige el responsable de la ejecución; después se puede planificar otra y la anterior se conserva', async () => {
      const id = (await api(tokens.auditor).get(`${EV}?activoId=${ids.aplicativo}`).expect(200)).body.data[0].id as number;
      const falta = await api(tokens.analista).patch(`${EV}/${id}/cerrar`, INFORME).expect(400);
      expect(falta.body.message).toBe('Para cerrar la evaluación falta: el responsable de la ejecución.');
      await api(tokens.analista).patch(`${EV}/${id}/cerrar`, { ...INFORME, responsableEjecucion: '   ' }).expect(400);
      const res = await api(tokens.analista).patch(`${EV}/${id}/cerrar`, { ...INFORME, responsableEjecucion: 'Seguridad TIC · M. López' }).expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', responsableEjecucion: 'Seguridad TIC · M. López' });
      expect((await trazas('EVALUACION_SISTEMA', id))[0].cambios).toEqual(expect.arrayContaining([{ campo: 'responsableEjecucion', antes: null, despues: 'Seguridad TIC · M. López' }]));
      await planificar(ids.aplicativo, enDias(15)).expect(201);
      expect((await api(tokens.auditor).get(`${EV}?activoId=${ids.aplicativo}`).expect(200)).body.meta.total).toBe(2);
    }, LENTO);

    it('filtra por categoría; calendario con «por ejecutar» y el activo; panel con las próximas', async () => {
      const vencida = (await planificar(ids.servidor, enDias(5)).expect(201)).body.id as number;
      await prisma.evaluacionSistema.update({ where: { id: vencida }, data: { fechaProgramadaProduccion: new Date(Date.now() - 3 * 86_400_000) } });
      expect((await api(tokens.auditor).get(`${EV}?categoriaId=${ids.aplicativos}&limit=100`).expect(200)).body.data.every((e: { activo: { codigo: string } }) => e.activo.codigo === 'APL-1')).toBe(true);
      const eventos = (await api(tokens.auditor).get(`${EV}/agenda?desde=${enDias(-30)}&hasta=${enDias(40)}&capa=1`).expect(200)).body as Array<{ clave: string; estado: string; titulo: string; detalle: string; activo: { codigo: string; categoria: string } }>;
      const ev = eventos.find((e) => e.clave === `ev1-${vencida}`)!;
      expect(ev).toMatchObject({ estado: 'POR_EJECUTAR', titulo: 'Evaluación de seguridad · SRV-1 · Equipo SRV-1', activo: { codigo: 'SRV-1', categoria: 'Servidores virtuales' } });
      expect(ev.detalle).toBe(`Evaluación #${vencida} · Servidores virtuales · Estado: Por ejecutar`);
      // En progreso con la fecha pasada sigue «en curso»: alguien ya la está ejecutando.
      await api(tokens.analista).patch(`${EV}/${vencida}/ejecucion`, { responsableEjecucion: 'Seguridad TIC' }).expect(200);
      const despues = (await api(tokens.auditor).get(`${EV}/agenda?desde=${enDias(-30)}&hasta=${enDias(40)}&capa=1`).expect(200)).body as Array<{ clave: string; estado: string }>;
      expect(despues.find((e) => e.clave === `ev1-${vencida}`)!.estado).toBe('EN_CURSO');
      const panel = (await api(tokens.auditor).get('/api/dashboard/indicadores').expect(200)).body;
      expect(panel.evaluaciones).toMatchObject({ proximas30Dias: 1, vencidas: 1, enProgreso: 1, abiertos: 1, cerrados: 1 });
    }, LENTO);
  });
});
