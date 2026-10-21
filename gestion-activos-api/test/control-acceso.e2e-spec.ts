/**
 * Pruebas e2e del módulo Control de acceso contra MySQL (gestion_activos_test) y
 * Keycloak: altas lógicas y físicas, códigos (también simultáneos), validación,
 * activos elegibles por categoría, transiciones, cierre, auditoría transaccional
 * y permisos. Además de la respuesta HTTP, se comprueba lo guardado en la base.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { ControlAccesoService } from './../src/access-control/control-acceso.service.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 120_000;
const HORA = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Control de acceso (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids: Record<'vm' | 'monitor' | 'programa' | 'pcBaja', number> = { vm: 0, monitor: 0, programa: 0, pcBaja: 0 };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const cat = async (nombre: string, admiteAccesoLogico: boolean, admiteAccesoFisico: boolean) =>
      (await prisma.categoria.create({ data: { nombre, descripcion: '', admiteAccesoLogico, admiteAccesoFisico } })).id;
    const virtuales = await cat('Servidores virtuales', true, false);
    const monitores = await cat('Monitores', false, true);
    const programas = await cat('Programas', true, false);
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Media' } })).id;
    const activo = (codigo: string, nombre: string, categoriaId: number, extra: object = {}) =>
      prisma.activo.create({
        data: { codigo, nombre, sistemas: '', custodio: 'TIC', ubicacion: 'Matriz', cifrado: false, ultimaRevision: new Date('2026-01-01'), categoriaId, criticidadId, ...extra },
      });
    ids.vm = (await activo('GLPI-PC-29', 'VM-CONTABILIDAD', virtuales, { tipo: 'Servidor Virtual', origenGlpi: 'Computer #29' })).id;
    ids.monitor = (await activo('MON-1', 'Monitor Dell', monitores)).id;
    ids.programa = (await activo('SW-1', 'Sistema contable', programas)).id;
    ids.pcBaja = (await activo('SW-BAJA', 'Programa retirado', programas, { deletedAt: new Date() })).id;
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
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };
  const base = () => ({
    tipoAcceso: 'LOGICO',
    tipoSolicitud: 'ACCESO',
    fechaSolicitud: iso(Date.now() - HORA),
    nombreSolicitante: 'Jorge Andrade',
    cargoSolicitante: 'Jefe de Contabilidad',
    nombreUsuarioBeneficiario: 'María Pérez',
    departamento: 'Contabilidad',
    descripcion: 'Acceso al sistema contable para el cierre mensual.',
  });
  const crear = (cuerpo: object, token = tokens.analista) => api(token).post('/api/control-acceso', { ...base(), ...cuerpo });
  const historial = (id: number) => prisma.historialControlAcceso.findMany({ where: { controlAccesoId: id }, orderBy: { id: 'asc' } });

  describe('alta', () => {
    it('lógica con activo: CAL-001, ABIERTO, sin fecha de atención; queda en MySQL con su historial de creación', async () => {
      const res = await crear({ activoId: ids.vm }).expect(201);
      expect(res.body).toMatchObject({ codigoUnico: 'CAL-001', tipoAcceso: 'LOGICO', estado: 'ABIERTO', fechaAtendido: null, recurso: null, activoId: ids.vm });
      expect(res.body.activo).toMatchObject({ codigo: 'GLPI-PC-29', categoria: 'Servidores virtuales' });
      const fila = await prisma.controlAcceso.findUniqueOrThrow({ where: { id: res.body.id } });
      // Solicitante (quien pide o autoriza) y beneficiario (quien recibe el acceso), por separado.
      expect(fila).toMatchObject({
        codigoUnico: 'CAL-001',
        estado: 'ABIERTO',
        activoId: ids.vm,
        fechaAtendido: null,
        nombreSolicitante: 'Jorge Andrade',
        cargoSolicitante: 'Jefe de Contabilidad',
        nombreUsuarioBeneficiario: 'María Pérez',
      });
      expect(await historial(res.body.id)).toMatchObject([{ campo: 'CREACION', valorNuevo: 'CAL-001', usuario: 'analista.test' }]);
    });

    it('física con recurso no inventariado: CAF-001 (correlativo propio del tipo)', async () => {
      const res = await crear({ tipoAcceso: 'FISICO', recurso: 'Sala de servidores' }).expect(201);
      expect(res.body).toMatchObject({ codigoUnico: 'CAF-001', activoId: null, activo: null, recurso: 'Sala de servidores' });
    });

    it('el cliente no fija código, estado, fecha de atención ni usuario (400)', async () => {
      await crear({ recurso: 'Correo', estado: 'CERRADO' }).expect(400);
      await crear({ recurso: 'Correo', codigoUnico: 'CAL-999' }).expect(400);
      await crear({ recurso: 'Correo', fechaAtendido: iso(Date.now()) }).expect(400);
      await crear({ recurso: 'Correo', usuario: 'otra.persona' }).expect(400);
    });

    it('campos obligatorios y coherencia: activo o recurso (no ninguno ni ambos), fechas y textos', async () => {
      expect((await crear({}).expect(400)).body.message).toMatch(/activo o describa el recurso/);
      expect((await crear({ activoId: ids.vm, recurso: 'Correo' }).expect(400)).body.message).toMatch(/no ambos/);
      await crear({ recurso: '   ' }).expect(400);
      await crear({ recurso: 'Correo', descripcion: 'corta' }).expect(400);
      await crear({ recurso: 'Correo', nombreUsuarioBeneficiario: undefined }).expect(400);
      // Solicitante y su cargo: obligatorios en una solicitud nueva.
      await crear({ recurso: 'Correo', nombreSolicitante: undefined }).expect(400);
      await crear({ recurso: 'Correo', cargoSolicitante: undefined }).expect(400);
      await crear({ recurso: 'Correo', nombreSolicitante: 'Jo' }).expect(400);
      await crear({ recurso: 'Correo', cargoSolicitante: '   ' }).expect(400);
      await crear({ recurso: 'Correo', fechaSolicitud: iso(Date.now() + 2 * HORA) }).expect(400);
      await crear({ recurso: 'Correo', fechaSolicitud: 'ayer por la tarde' }).expect(400);
      await crear({ recurso: 'Correo', tipoAcceso: 'REMOTO' }).expect(400);
      // La fecha deseada ya no existe en el modelo.
      await crear({ recurso: 'Correo', fechaAccesoDeseada: iso(Date.now()) }).expect(400);
    });

    it('elegibilidad del activo según la categoría (Catálogos) y su vigencia', async () => {
      // Un servidor virtual no admite acceso físico; un monitor no admite acceso lógico.
      expect((await crear({ tipoAcceso: 'FISICO', activoId: ids.vm }).expect(400)).body.message).toMatch(/no es elegible para acceso físico/);
      await crear({ activoId: ids.monitor }).expect(400);
      await crear({ activoId: ids.pcBaja }).expect(400);
      await crear({ activoId: 999999 }).expect(400);
      await crear({ tipoAcceso: 'FISICO', activoId: ids.monitor }).expect(201);
    });
  });

  describe('códigos', () => {
    it('20 altas simultáneas no repiten código y siguen el correlativo', async () => {
      const antes = (await prisma.contadorControlAcceso.findUniqueOrThrow({ where: { tipoAcceso: 'LOGICO' } })).ultimo;
      const respuestas = await Promise.all(Array.from({ length: 20 }, () => crear({ recurso: 'Correo institucional' })));
      expect(respuestas.map((r) => r.status)).toEqual(Array(20).fill(201));
      const codigos = respuestas.map((r) => r.body.codigoUnico as string);
      expect(new Set(codigos).size).toBe(20);
      const numeros = codigos.map((c) => Number(c.slice(4))).sort((a, b) => a - b);
      expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => antes + 1 + i));
      expect((await prisma.contadorControlAcceso.findUniqueOrThrow({ where: { tipoAcceso: 'LOGICO' } })).ultimo).toBe(antes + 20);
    }, LENTO);
  });

  describe('activos elegibles (filtrados en el servidor)', () => {
    it('lógico: vigentes de categorías que lo admiten; físico: los suyos', async () => {
      const logico = (await api(tokens.auditor).get('/api/control-acceso/activos-elegibles?tipoAcceso=LOGICO&limit=100').expect(200)).body;
      expect(logico.data.map((a: { id: number }) => a.id).sort((a: number, b: number) => a - b)).toEqual([ids.vm, ids.programa].sort((a, b) => a - b));
      const fisico = (await api(tokens.auditor).get('/api/control-acceso/activos-elegibles?tipoAcceso=FISICO&limit=100').expect(200)).body;
      expect(fisico.data.map((a: { id: number }) => a.id)).toEqual([ids.monitor]);
      const buscado = (await api(tokens.auditor).get('/api/control-acceso/activos-elegibles?tipoAcceso=LOGICO&q=VM-CONTAB').expect(200)).body;
      expect(buscado.data.map((a: { codigo: string }) => a.codigo)).toEqual(['GLPI-PC-29']);
      const categorias = (await api(tokens.auditor).get('/api/control-acceso/categorias-elegibles?tipoAcceso=LOGICO').expect(200)).body;
      expect(categorias).toEqual([
        expect.objectContaining({ nombre: 'Programas', total: 1 }),
        expect.objectContaining({ nombre: 'Servidores virtuales', total: 1 }),
      ]);
      await api(tokens.auditor).get('/api/control-acceso/activos-elegibles').expect(400);
    });

    it('cambiar la marca de la categoría en Catálogos cambia el filtro (y solo el admin puede)', async () => {
      const monitores = (await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Monitores' } })).id;
      await api(tokens.analista).patch(`/api/categorias/${monitores}`, { admiteAccesoLogico: true }).expect(403);
      const res = await api(tokens.admin).patch(`/api/categorias/${monitores}`, { admiteAccesoLogico: true }).expect(200);
      expect(res.body).toMatchObject({ admiteAccesoLogico: true, admiteAccesoFisico: true });
      const logico = (await api(tokens.auditor).get('/api/control-acceso/activos-elegibles?tipoAcceso=LOGICO&limit=100').expect(200)).body;
      expect(logico.data.map((a: { id: number }) => a.id)).toContain(ids.monitor);
      await api(tokens.admin).patch(`/api/categorias/${monitores}`, { admiteAccesoLogico: false }).expect(200);
    });
  });

  describe('estados y cierre', () => {
    it('ABIERTO → PENDIENTE → CERRADO con la fecha atendida que se indica (no la del servidor); transiciones inválidas → 409', async () => {
      const { id, fechaSolicitud } = (await crear({ recurso: 'Aplicación de nómina' }).expect(201)).body;
      await api(tokens.analista).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'Motivo suficientemente largo para reabrir.' }).expect(403);
      await api(tokens.admin).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'Motivo suficientemente largo para reabrir.' }).expect(409);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(200);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(409);
      // La fecha de atención la pone quien cierra, no el sistema: sin ella o inválida, 400.
      const cerrar = (cuerpo: object, token = tokens.analista) => api(token).patch(`/api/control-acceso/${id}/cerrar`, cuerpo);
      await cerrar({ resolucion: 'Cuenta creada en nómina.' }).expect(400);
      await cerrar({ resolucion: 'Cuenta creada en nómina.', fechaAtendido: 'mañana temprano' }).expect(400);
      await cerrar({ resolucion: 'Cuenta creada en nómina.', fechaAtendido: '2026-02-30T25:00:00Z' }).expect(400);
      expect((await cerrar({ resolucion: 'Cuenta creada en nómina.', fechaAtendido: iso(Date.now() + 2 * HORA) }).expect(400)).body.message).toMatch(/futura/);
      expect(
        (await cerrar({ resolucion: 'Cuenta creada en nómina.', fechaAtendido: iso(new Date(fechaSolicitud).getTime() - HORA) }).expect(400)).body.message,
      ).toMatch(/anterior a la fecha de solicitud/);
      await cerrar({ resolucion: 'corta', fechaAtendido: iso(Date.now() - 30 * 60_000) }).expect(400);
      // Fecha histórica: anterior al registro de la solicitud (que se registró ahora).
      const atendidoIso = iso(Date.now() - 30 * 60_000);
      const res = await cerrar({ resolucion: 'Cuenta creada en nómina.', fechaAtendido: atendidoIso }).expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', resolucion: 'Cuenta creada en nómina.', fechaAtendido: atendidoIso });
      expect(new Date(res.body.fechaAtendido).getTime()).toBeLessThan(new Date(res.body.fechaCreacion).getTime());
      // Persistida tal cual en MySQL; la fecha de creación no cambia.
      const fila = await prisma.controlAcceso.findUniqueOrThrow({ where: { id } });
      expect(fila.fechaAtendido?.toISOString()).toBe(atendidoIso);
      expect(fila.fechaCreacion.toISOString()).toBe(res.body.fechaCreacion);
      const atendido = new Date(atendidoIso).getTime();
      await cerrar({ resolucion: 'Otra vez cerrada.', fechaAtendido: atendidoIso }).expect(409);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(409);
      // Reabrir: solo admin, con motivo; vuelve a PENDIENTE y quita la atención (queda en el historial).
      await api(tokens.admin).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'corto' }).expect(400);
      const re = await api(tokens.admin).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'El usuario no puede ingresar: se revisa de nuevo.' }).expect(200);
      expect(re.body).toMatchObject({ estado: 'PENDIENTE', fechaAtendido: null, resolucion: null });

      const h = await historial(id);
      const estados = h.filter((x) => x.campo === 'estado').map((x) => [x.valorAnterior, x.valorNuevo, x.usuario]);
      expect(estados).toEqual([
        ['ABIERTO', 'PENDIENTE', 'analista.test'],
        ['PENDIENTE', 'CERRADO', 'analista.test'],
        ['CERRADO', 'PENDIENTE', 'admin.test'],
      ]);
      const fechas = h.filter((x) => x.campo === 'fechaAtendido');
      expect(fechas[0]).toMatchObject({ valorAnterior: null, valorNuevo: new Date(atendido).toISOString() });
      expect(fechas[1]).toMatchObject({ valorAnterior: new Date(atendido).toISOString(), valorNuevo: null, motivo: 'El usuario no puede ingresar: se revisa de nuevo.' });
    });

    it('una solicitud de hace un mes se cierra con la fecha real en que se atendió (histórica)', async () => {
      const haceUnMes = Date.now() - 30 * 24 * HORA;
      const { id } = (await crear({ recurso: 'Sistema de nómina', fechaSolicitud: iso(haceUnMes) }).expect(201)).body;
      const atendidoIso = iso(haceUnMes + 2 * 24 * HORA);
      const res = await api(tokens.admin).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Acceso otorgado el mismo mes.', fechaAtendido: atendidoIso }).expect(200);
      expect(res.body.fechaAtendido).toBe(atendidoIso);
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).fechaAtendido?.toISOString()).toBe(atendidoIso);
    });

    it('la fecha atendida y la resolución no se envían mientras no esté cerrada', async () => {
      const { id } = (await crear({ recurso: 'VPN' }).expect(201)).body;
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: iso(Date.now()) }).expect(400);
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { resolucion: 'Resolución adelantada.' }).expect(400);
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).fechaAtendido).toBeNull();
    });

    it('filtro por fecha de solicitud (la fecha deseada ya no existe)', async () => {
      const antigua = (await crear({ recurso: 'VPN', fechaSolicitud: iso(Date.now() - 60 * 24 * HORA) }).expect(201)).body;
      const desde = iso(Date.now() - 61 * 24 * HORA);
      const hasta = iso(Date.now() - 59 * 24 * HORA);
      const lista = (await api(tokens.auditor).get(`/api/control-acceso?desde=${desde}&hasta=${hasta}&limit=100`).expect(200)).body;
      expect(lista.data.map((s: { id: number }) => s.id)).toEqual([antigua.id]);
      expect(lista.data[0]).not.toHaveProperty('fechaAccesoDeseada');
      expect(lista.data[0]).not.toHaveProperty('situacion');
    });
  });

  describe('corrección de solicitudes cerradas', () => {
    it('solo el admin la corrige, con motivo; la fecha atendida corregida queda auditada', async () => {
      const { id } = (await crear({ recurso: 'Correo institucional' }).expect(201)).body;
      const primera = iso(Date.now() - 20 * 60_000);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Buzón creado.', fechaAtendido: primera }).expect(200);
      // Analista: 403. Auditor: 403. Admin sin motivo suficiente: 400.
      await api(tokens.analista).patch(`/api/control-acceso/${id}`, { departamento: 'Talento Humano', motivo: 'Corrección del departamento del beneficiario.' }).expect(403);
      await api(tokens.auditor).patch(`/api/control-acceso/${id}`, { departamento: 'Talento Humano', motivo: 'Corrección del departamento del beneficiario.' }).expect(403);
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: iso(Date.now() - 40 * 60_000) }).expect(400);
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: iso(Date.now() - 40 * 60_000), motivo: 'corto' }).expect(400);
      // Fecha corregida inválida: futura o anterior a la solicitud.
      const motivo = 'El acta de entrega indica otra hora de atención.';
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: iso(Date.now() + 3 * HORA), motivo }).expect(400);
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: iso(Date.now() - 5 * HORA), motivo }).expect(400);
      // El tipo de acceso de una cerrada no cambia.
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { tipoAcceso: 'FISICO', motivo }).expect(409);
      const corregida = iso(Date.now() - 40 * 60_000);
      const res = await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: corregida, resolucion: 'Buzón creado y probado.', motivo }).expect(200);
      expect(res.body).toMatchObject({ estado: 'CERRADO', fechaAtendido: corregida, resolucion: 'Buzón creado y probado.' });
      const h = await historial(id);
      expect(h.filter((x) => x.campo === 'fechaAtendido').at(-1)).toMatchObject({ valorAnterior: primera, valorNuevo: corregida, usuario: 'admin.test', motivo });
      expect(h.filter((x) => x.campo === 'resolucion').at(-1)).toMatchObject({ valorAnterior: 'Buzón creado.', valorNuevo: 'Buzón creado y probado.' });
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).fechaAtendido?.toISOString()).toBe(corregida);
    });

    it('registros anteriores sin solicitante: se muestran sin inventarlo y el admin puede completarlo', async () => {
      // Como las solicitudes previas a la migración: sin solicitante ni cargo, ya cerradas,
      // sobre un activo que después se dio de baja.
      const contador = await prisma.contadorControlAcceso.update({ where: { tipoAcceso: 'LOGICO' }, data: { ultimo: { increment: 1 } } });
      const antigua = await prisma.controlAcceso.create({
        data: {
          codigoUnico: `CAL-${String(contador.ultimo).padStart(3, '0')}`,
          tipoAcceso: 'LOGICO',
          tipoSolicitud: 'ACCESO',
          activoId: ids.pcBaja,
          fechaSolicitud: new Date(Date.now() - 10 * 24 * HORA),
          nombreUsuarioBeneficiario: 'Luis Mora',
          departamento: 'TIC',
          descripcion: 'Solicitud registrada antes de existir el solicitante.',
          estado: 'CERRADO',
          resolucion: 'Acceso otorgado.',
          fechaAtendido: new Date(Date.now() - 9 * 24 * HORA),
        },
      });
      const vista = (await api(tokens.auditor).get(`/api/control-acceso/${antigua.id}`).expect(200)).body;
      expect(vista).toMatchObject({ nombreSolicitante: null, cargoSolicitante: null, nombreUsuarioBeneficiario: 'Luis Mora' });
      // Completar el solicitante no exige que su activo (ya dado de baja) siga siendo elegible.
      const res = await api(tokens.admin)
        .patch(`/api/control-acceso/${antigua.id}`, { nombreSolicitante: 'Rosa Vega', cargoSolicitante: 'Directora TIC', motivo: 'Se completa el solicitante con el oficio original.' })
        .expect(200);
      expect(res.body).toMatchObject({ nombreSolicitante: 'Rosa Vega', cargoSolicitante: 'Directora TIC', activoId: ids.pcBaja, estado: 'CERRADO' });
      expect((await historial(antigua.id)).map((x) => [x.campo, x.valorAnterior, x.valorNuevo])).toEqual([
        ['nombreSolicitante', null, 'Rosa Vega'],
        ['cargoSolicitante', null, 'Directora TIC'],
      ]);
    });
  });

  describe('altas y bajas', () => {
    it('ALTA (otorgamiento) y BAJA (desvinculación) se registran, filtran y cierran por separado', async () => {
      const alta = (await crear({ tipoSolicitud: 'ACCESO', recurso: 'Sistema documental' }).expect(201)).body;
      const baja = (await crear({ tipoSolicitud: 'BAJA', recurso: 'Sistema documental', nombreUsuarioBeneficiario: 'Pedro Salas' }).expect(201)).body;
      expect([alta.tipoSolicitud, baja.tipoSolicitud]).toEqual(['ACCESO', 'BAJA']);
      const soloBajas = (await api(tokens.auditor).get('/api/control-acceso?tipoSolicitud=BAJA&limit=100').expect(200)).body;
      expect(soloBajas.data.every((s: { tipoSolicitud: string }) => s.tipoSolicitud === 'BAJA')).toBe(true);
      expect(soloBajas.data.map((s: { id: number }) => s.id)).toContain(baja.id);
      expect(soloBajas.data.map((s: { id: number }) => s.id)).not.toContain(alta.id);
      const cerrada = (await api(tokens.analista)
        .patch(`/api/control-acceso/${baja.id}/cerrar`, { resolucion: 'Cuenta de Pedro Salas deshabilitada.', fechaAtendido: iso(Date.now() - 10 * 60_000) })
        .expect(200)).body;
      expect(cerrada).toMatchObject({ estado: 'CERRADO', tipoSolicitud: 'BAJA' });
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id: alta.id } })).estado).toBe('ABIERTO');
    });

    it('una BAJA sobre un activo no retira ni modifica el activo', async () => {
      const antes = await prisma.activo.findUniqueOrThrow({ where: { id: ids.programa } });
      const { id } = (await crear({ tipoSolicitud: 'BAJA', activoId: ids.programa }).expect(201)).body;
      await api(tokens.analista).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Acceso al sistema contable retirado.', fechaAtendido: iso(Date.now() - 5 * 60_000) }).expect(200);
      expect(await prisma.activo.findUniqueOrThrow({ where: { id: ids.programa } })).toEqual(antes);
    });
  });

  describe('auditoría', () => {
    it('cada campo modificado queda con su valor anterior y nuevo, y el usuario del token', async () => {
      const { id } = (await crear({ recurso: 'Correo institucional' }).expect(201)).body;
      const nuevaFecha = iso(Date.now() - 3 * HORA);
      await api(tokens.analista)
        .patch(`/api/control-acceso/${id}`, {
          departamento: 'Talento Humano',
          fechaSolicitud: nuevaFecha,
          activoId: ids.programa,
          nombreSolicitante: 'Elena Ruiz',
          cargoSolicitante: 'Directora de Talento Humano',
          nombreUsuarioBeneficiario: 'Mario Pérez',
          tipoSolicitud: 'BAJA',
          motivo: 'Se precisa el sistema, no el correo.',
        })
        .expect(200);
      // El usuario del historial no lo puede fijar el cliente.
      await api(tokens.analista).patch(`/api/control-acceso/${id}`, { departamento: 'TIC', usuario: 'otra.persona' }).expect(400);
      // Cambiar el tipo (solo en ABIERTO) da un código de la otra serie; ambos cambios se auditan.
      const fisico = await api(tokens.analista).patch(`/api/control-acceso/${id}`, { tipoAcceso: 'FISICO', activoId: ids.monitor }).expect(200);
      expect(fisico.body.codigoUnico).toMatch(/^CAF-\d{3,}$/);

      const h = await historial(id);
      const por = (campo: string) => h.filter((x) => x.campo === campo);
      expect(por('departamento')[0]).toMatchObject({ valorAnterior: 'Contabilidad', valorNuevo: 'Talento Humano', usuario: 'analista.test', motivo: 'Se precisa el sistema, no el correo.' });
      expect(por('fechaSolicitud')[0].valorNuevo).toBe(nuevaFecha);
      // Solicitante, beneficiario y tipo de solicitud: cada uno con su entrada.
      expect(por('nombreSolicitante')[0]).toMatchObject({ valorAnterior: 'Jorge Andrade', valorNuevo: 'Elena Ruiz', usuario: 'analista.test' });
      expect(por('cargoSolicitante')[0]).toMatchObject({ valorAnterior: 'Jefe de Contabilidad', valorNuevo: 'Directora de Talento Humano' });
      expect(por('nombreUsuarioBeneficiario')[0]).toMatchObject({ valorAnterior: 'María Pérez', valorNuevo: 'Mario Pérez' });
      expect(por('tipoSolicitud')[0]).toMatchObject({ valorAnterior: 'ACCESO', valorNuevo: 'BAJA' });
      expect(por('activoId')[0]).toMatchObject({ valorAnterior: null, valorNuevo: String(ids.programa) });
      expect(por('recurso')[0]).toMatchObject({ valorAnterior: 'Correo institucional', valorNuevo: null });
      expect(por('tipoAcceso')[0]).toMatchObject({ valorAnterior: 'LOGICO', valorNuevo: 'FISICO' });
      expect(por('codigoUnico')[0].valorNuevo).toBe(fisico.body.codigoUnico);
      // En la base: los valores nuevos, persistidos.
      expect(await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).toMatchObject({
        departamento: 'Talento Humano',
        tipoAcceso: 'FISICO',
        activoId: ids.monitor,
        recurso: null,
        codigoUnico: fisico.body.codigoUnico,
      });
      // Una vez PENDIENTE, el tipo ya no cambia.
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(200);
      await api(tokens.analista).patch(`/api/control-acceso/${id}`, { tipoAcceso: 'LOGICO', recurso: 'Correo' }).expect(409);
    });

    it('si falla la auditoría, el cambio se revierte (misma transacción)', async () => {
      const { id } = (await crear({ recurso: 'Correo institucional' }).expect(201)).body;
      const espia = vi
        .spyOn(ControlAccesoService.prototype as unknown as { auditar: () => Promise<void> }, 'auditar')
        .mockRejectedValueOnce(new Error('fallo simulado del historial'));
      await api(tokens.analista).patch(`/api/control-acceso/${id}`, { departamento: 'Otro departamento' }).expect(500);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(200); // el siguiente sí se audita
      espia.mockRestore();
      const fila = await prisma.controlAcceso.findUniqueOrThrow({ where: { id } });
      expect(fila.departamento).toBe('Contabilidad');
      expect((await historial(id)).map((x) => x.campo)).toEqual(['CREACION', 'estado']);
    });

    it('el historial es de solo lectura: no hay rutas para escribirlo, borrarlo ni editarlo', async () => {
      const { id } = (await crear({ recurso: 'Correo institucional' }).expect(201)).body;
      const antes = await historial(id);
      await api(tokens.admin).post(`/api/control-acceso/${id}/historial`, { campo: 'estado' }).expect(404);
      await api(tokens.admin).patch(`/api/control-acceso/${id}/historial`, { campo: 'estado' }).expect(404);
      await api(tokens.admin).delete(`/api/control-acceso/${id}/historial`).expect(404);
      await api(tokens.admin).delete(`/api/control-acceso/${id}`).expect(404);
      expect(await historial(id)).toEqual(antes);
      const visto = (await api(tokens.auditor).get(`/api/control-acceso/${id}/historial`).expect(200)).body;
      expect(visto).toMatchObject([{ campo: 'CREACION', usuario: 'analista.test' }]);
    });
  });

  describe('permisos', () => {
    it('el auditor consulta pero no registra, modifica ni cambia estados', async () => {
      const { id } = (await crear({ recurso: 'Correo institucional' }).expect(201)).body;
      await api(tokens.auditor).get('/api/control-acceso').expect(200);
      await api(tokens.auditor).get(`/api/control-acceso/${id}`).expect(200);
      await crear({ recurso: 'Correo' }, tokens.auditor).expect(403);
      await api(tokens.auditor).patch(`/api/control-acceso/${id}`, { departamento: 'X' }).expect(403);
      await api(tokens.auditor).patch(`/api/control-acceso/${id}/pendiente`).expect(403);
      await api(tokens.auditor).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Acceso concedido hoy.', fechaAtendido: iso(Date.now()) }).expect(403);
      await api(tokens.auditor).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'Motivo suficientemente largo.' }).expect(403);
      await request(app.getHttpServer()).get('/api/control-acceso').expect(401);
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).estado).toBe('ABIERTO');
    });

    it('listado: filtros por tipo, estado, tipo de solicitud y búsqueda', async () => {
      const fisicas = (await api(tokens.auditor).get('/api/control-acceso?tipoAcceso=FISICO&limit=100').expect(200)).body;
      expect(fisicas.data.every((s: { codigoUnico: string }) => s.codigoUnico.startsWith('CAF-'))).toBe(true);
      const bajas = (await api(tokens.auditor).get('/api/control-acceso?tipoSolicitud=BAJA&estado=CERRADO').expect(200)).body;
      expect(bajas.meta.total).toBe(await prisma.controlAcceso.count({ where: { tipoSolicitud: 'BAJA', estado: 'CERRADO' } }));
      expect(bajas.meta.total).toBeGreaterThan(0);
      const busqueda = (await api(tokens.auditor).get('/api/control-acceso?q=VM-CONTAB').expect(200)).body;
      expect(busqueda.data.map((s: { codigoUnico: string }) => s.codigoUnico)).toEqual(['CAL-001']);
    });
  });

  describe('aislamiento del estado', () => {
    it('el flujo completo de una solicitud no altera el activo (estado de GLPI, baja, categoría ni bitácora)', async () => {
      // Un activo con condición física de GLPI, como los sincronizados.
      await prisma.activo.update({ where: { id: ids.vm }, data: { estado: 'Malo' } });
      const foto = async () => {
        const a = await prisma.activo.findUniqueOrThrow({ where: { id: ids.vm } });
        const bitacora = await prisma.bitacoraHistorial.count({ where: { activoId: ids.vm } });
        return { ...a, bitacora };
      };
      const antes = await foto();

      const { id } = (await crear({ activoId: ids.vm }).expect(201)).body;
      await api(tokens.analista).patch(`/api/control-acceso/${id}/pendiente`).expect(200);
      const hace = (min: number) => iso(Date.now() - min * 60_000);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Acceso otorgado en la VM.', fechaAtendido: hace(5) }).expect(200);
      await api(tokens.admin).patch(`/api/control-acceso/${id}`, { fechaAtendido: hace(10), motivo: 'Se corrige la hora con el acta de entrega.' }).expect(200);
      await api(tokens.admin).patch(`/api/control-acceso/${id}/reabrir`, { motivo: 'Se revisa de nuevo el acceso concedido.' }).expect(200);
      await api(tokens.analista).patch(`/api/control-acceso/${id}`, { tipoSolicitud: 'BAJA', descripcion: 'Retirar el acceso: la usuaria cambió de área.' }).expect(200);
      await api(tokens.analista).patch(`/api/control-acceso/${id}/cerrar`, { resolucion: 'Acceso retirado de la VM.', fechaAtendido: hace(1) }).expect(200);

      // La solicitud recorrió sus estados; el activo sigue exactamente igual (incluida updatedAt).
      expect((await prisma.controlAcceso.findUniqueOrThrow({ where: { id } })).estado).toBe('CERRADO');
      expect(await foto()).toEqual(antes);
      expect(antes).toMatchObject({ estado: 'Malo', deletedAt: null, inactivoDesde: null });
    });
  });
});
