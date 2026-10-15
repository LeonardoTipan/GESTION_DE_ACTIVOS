/**
 * Pruebas e2e de las TRES CAPAS de mantenimientos y vulnerabilidades, de los
 * filtros por categoría y de los avisos que generan. Recorren la API real
 * contra MySQL (gestion_activos_test) y Keycloak y comprueban, además de la
 * respuesta HTTP, lo que quedó guardado en la base.
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
const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
const en = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();
const MOTIVO = 'Corrección registrada tras la revisión del acta PR-11/2026.';

describe('Tres capas: planificación, ejecución y verificación (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  const ids = { computadoras: 0, monitores: 0, pc: 0, pcMala: 0, monitor: 0, baja: 0 };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    ids.computadoras = (await prisma.categoria.create({ data: { nombre: 'Computadoras', descripcion: 'Tipo de activo de GLPI: Computer' } })).id;
    ids.monitores = (await prisma.categoria.create({ data: { nombre: 'Monitores', descripcion: 'Tipo de activo de GLPI: Monitor' } })).id;
    const criticidad = (await prisma.criticidad.create({ data: { nivel: 'Media' } })).id;
    const activo = async (codigo: string, categoriaId: number, extra: object = {}) =>
      (
        await prisma.activo.create({
          data: {
            codigo,
            nombre: `Equipo ${codigo}`,
            sistemas: '',
            custodio: 'TIC',
            ubicacion: 'Matriz',
            cifrado: false,
            ultimaRevision: new Date('2026-01-01'),
            categoriaId,
            criticidadId: criticidad,
            estado: 'Bueno',
            ...extra,
          },
        })
      ).id;
    ids.pc = await activo('PC-0001', ids.computadoras, { origenGlpi: 'Computer #1' });
    // En GLPI "Malo" es una CONDICIÓN física: sigue en el inventario y admite mantenimiento.
    ids.pcMala = await activo('PC-0002', ids.computadoras, { estado: 'Malo', origenGlpi: 'Computer #2' });
    ids.monitor = await activo('MON-0001', ids.monitores, { origenGlpi: 'Monitor #7' });
    ids.baja = await activo('PC-0003', ids.computadoras, { inactivoDesde: new Date(), motivoInactivo: 'PAPELERA_GLPI' });
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
  const avisos = (tipo: string) => prisma.notificacion.findMany({ where: { tipo: tipo as never } });

  describe('inventario por categoría de GLPI', () => {
    it('filtra por categoría y busca por nombre de categoría o referencia de GLPI', async () => {
      const porCategoria = await api(tokens.auditor).get(`/api/activos?categoriaId=${ids.monitores}`).expect(200);
      expect(porCategoria.body.data.map((a: { codigo: string }) => a.codigo)).toEqual(['MON-0001']);

      const porNombre = await api(tokens.auditor).get('/api/activos?q=monitores').expect(200);
      expect(porNombre.body.meta.total).toBe(1);

      const porReferencia = await api(tokens.auditor).get(`/api/activos?q=${encodeURIComponent('Computer #2')}`).expect(200);
      expect(porReferencia.body.data[0].codigo).toBe('PC-0002');
    });

    it('categorías con activos y su recuento: solo las que tienen alguno; con operativos=true, sin bajas', async () => {
      await prisma.categoria.create({ data: { nombre: 'Racks', descripcion: 'Tipo de activo de GLPI: Rack' } });
      await api('').get('/api/activos/categorias').expect(401);
      const operativas = await api(tokens.auditor).get('/api/activos/categorias?operativos=true').expect(200);
      expect(operativas.body).toEqual([
        { categoriaId: ids.computadoras, nombre: 'Computadoras', total: 2 },
        { categoriaId: ids.monitores, nombre: 'Monitores', total: 1 },
      ]);
      const todas = await api(tokens.auditor).get('/api/activos/categorias').expect(200);
      expect(todas.body.find((c: { nombre: string }) => c.nombre === 'Computadoras').total).toBe(3);
      expect(todas.body.some((c: { nombre: string }) => c.nombre === 'Racks')).toBe(false);
    });

    it('filtros combinados: categoría + condición física + solo operativos', async () => {
      const res = await api(tokens.auditor)
        .get(`/api/activos?categoriaId=${ids.computadoras}&estado=Malo&operativos=true`)
        .expect(200);
      expect(res.body.data.map((a: { codigo: string }) => a.codigo)).toEqual(['PC-0002']);
      // El que está en la papelera de GLPI no cuenta como operativo.
      const operativos = await api(tokens.auditor).get(`/api/activos?categoriaId=${ids.computadoras}&operativos=true`).expect(200);
      expect(operativos.body.meta.total).toBe(2);
    });
  });

  describe('mantenimientos · capa 1: planificación', () => {
    let planId: number;

    it('crea planes para varios activos; el auditor no puede (403)', async () => {
      const cuerpo = {
        tipo: 'PREVENTIVO',
        frecuencia: 'TRIMESTRAL',
        proximaFecha: en(5),
        responsable: 'Soporte TIC',
        actividades: 'Limpieza interna, revisión de ventiladores y actualización de firmware.',
        activoIds: [ids.pc, ids.pcMala],
      };
      await api(tokens.auditor).post('/api/mantenimientos/planes', cuerpo).expect(403);
      const res = await api(tokens.analista).post('/api/mantenimientos/planes', cuerpo).expect(201);
      expect(res.body).toHaveLength(2);
      planId = res.body.find((p: { activoId: number }) => p.activoId === ids.pc).id;
      expect(await prisma.planMantenimiento.count()).toBe(2);
    }, LENTO);

    it('un solo plan vigente por activo y tipo; un activo dado de baja no admite plan', async () => {
      const base = {
        tipo: 'PREVENTIVO',
        frecuencia: 'ANUAL',
        proximaFecha: en(30),
        responsable: 'Soporte',
        actividades: 'Revisión general del equipo.',
      };
      const dup = await api(tokens.analista).post('/api/mantenimientos/planes', { ...base, activoIds: [ids.pc] }).expect(409);
      expect(dup.body.message).toContain('PC-0001');
      await api(tokens.analista).post('/api/mantenimientos/planes', { ...base, activoIds: [ids.baja] }).expect(400);
      expect(await prisma.planMantenimiento.count()).toBe(2);
    });

    it('tablero: próximas intervenciones y activos operativos sin plan', async () => {
      const res = await api(tokens.auditor).get('/api/mantenimientos/tablero').expect(200);
      expect(res.body.proximas.filter((p: { origen: string }) => p.origen === 'PLAN')).toHaveLength(2);
      // Solo el monitor: el dado de baja no cuenta como pendiente.
      expect(res.body.activosSinPlan).toBe(1);
      expect(res.body.ejemplosSinPlan[0].codigo).toBe('MON-0001');
    });

    it('programar crea el mantenimiento y adelanta la próxima fecha según la frecuencia', async () => {
      const antes = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } });
      const res = await api(tokens.analista).post(`/api/mantenimientos/planes/${planId}/programar`).expect(201);
      const despues = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } });
      const meses =
        (despues.proximaFecha!.getUTCFullYear() - antes.proximaFecha!.getUTCFullYear()) * 12 +
        despues.proximaFecha!.getUTCMonth() -
        antes.proximaFecha!.getUTCMonth();
      expect(meses).toBe(3);
      const m = await prisma.mantenimiento.findUniqueOrThrow({ where: { id: res.body.mantenimientoId } });
      expect(m).toMatchObject({ planId, activoId: ids.pc, fase: 'PROGRAMADO' });
      const porPlan = await api(tokens.auditor).get(`/api/mantenimientos?planId=${planId}`).expect(200);
      expect(porPlan.body.meta.total).toBe(1);
    });

    it('editar el plan exige motivo y deja traza', async () => {
      await api(tokens.analista).patch(`/api/mantenimientos/planes/${planId}`, { responsable: 'Otro' }).expect(400);
      await api(tokens.analista)
        .patch(`/api/mantenimientos/planes/${planId}`, { responsable: 'Mesa de servicio', motivoCambio: MOTIVO })
        .expect(200);
      const trazas = await api(tokens.auditor).get(`/api/trazas?entidad=PLAN_MANTENIMIENTO&registroId=${planId}`).expect(200);
      expect(trazas.body[0]).toMatchObject({ accion: 'MODIFICAR', motivo: MOTIVO, responsable: 'analista.test' });
    });
  });

  describe('mantenimientos · capas 2 y 3: ejecución, verificación y cierre', () => {
    let id: number;

    beforeAll(async () => {
      // El equipo en condición "Malo" recibe un mantenimiento correctivo.
      id = (
        await api(tokens.analista)
          .post('/api/mantenimientos', { activoId: ids.pcMala, tipo: 'CORRECTIVO', actividad: 'Fuente dañada', fecha: hace(1) })
          .expect(201)
      ).body.id;
      await api(tokens.analista).patch(`/api/mantenimientos/${id}/iniciar`, { fechaInicio: hace(1), tecnico: 'jperez' }).expect(200);
    }, LENTO);

    it('finalizar exige diagnóstico y duración', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, { resultado: 'Fuente reemplazada.', estadoEquipo: 'OPERATIVO' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/diagnostico|duracionMin/);
    });

    it('finalizar guarda técnico, diagnóstico, duración, costo y repuestos, y actualiza la última revisión', async () => {
      await api(tokens.analista)
        .patch(`/api/mantenimientos/${id}/finalizar`, {
          resultado: 'Fuente reemplazada y pruebas de encendido.',
          estadoEquipo: 'OPERATIVO',
          diagnostico: 'Fuente de poder quemada.',
          duracionMin: 90,
          costo: 45.5,
          repuestos: 'Fuente ATX 500 W',
        })
        .expect(200);
      const m = await prisma.mantenimiento.findUniqueOrThrow({ where: { id } });
      expect(m).toMatchObject({ fase: 'FINALIZADO', tecnico: 'jperez', diagnostico: 'Fuente de poder quemada.', duracionMin: 90 });
      expect(Number(m.costo)).toBe(45.5);
      const activo = await prisma.activo.findUniqueOrThrow({ where: { id: ids.pcMala } });
      expect(activo.ultimaRevision.getTime()).toBe(m.fechaFin!.getTime());
      // La condición "Malo" no lo da de baja.
      expect(activo.inactivoDesde).toBeNull();

      const pendientes = await api(tokens.auditor).get('/api/mantenimientos?cierre=PENDIENTE_VERIFICACION').expect(200);
      expect(pendientes.body.data.map((x: { id: number }) => x.id)).toContain(id);
    });

    it('no se cierra como OPERATIVO sin evidencia', async () => {
      const res = await api(tokens.analista)
        .post(`/api/mantenimientos/${id}/verificaciones`, {
          fecha: new Date().toISOString(),
          resultado: 'OPERATIVO',
          observaciones: 'El equipo enciende y funciona.',
          responsable: 'Supervisor',
        })
        .expect(400);
      expect(res.body.message).toContain('evidencia');
      expect(await prisma.verificacionMantenimiento.count()).toBe(0);
    });

    it('NO_SATISFACTORIO genera un aviso y mantiene el caso abierto', async () => {
      await api(tokens.analista)
        .post(`/api/mantenimientos/${id}/verificaciones`, {
          fecha: new Date().toISOString(),
          resultado: 'NO_SATISFACTORIO',
          observaciones: 'El equipo se reinicia solo tras una hora.',
          responsable: 'Supervisor',
        })
        .expect(201);
      const lista = await avisos('MANTENIMIENTO_NO_SATISFACTORIO');
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ activoId: ids.pcMala });
      const m = await api(tokens.auditor).get(`/api/mantenimientos/${id}`).expect(200);
      expect(m.body.cierre).toBe('NO_SATISFACTORIO');
    });

    it('OPERATIVO con evidencia lo cierra; luego no admite más verificaciones', async () => {
      const cuerpo = {
        fecha: new Date().toISOString(),
        resultado: 'OPERATIVO',
        observaciones: 'Tras reemplazar el cable, funciona estable.',
        evidencia: 'Acta de conformidad 34/2026',
        responsable: 'Supervisor',
      };
      await api(tokens.auditor).post(`/api/mantenimientos/${id}/verificaciones`, cuerpo).expect(403);
      await api(tokens.analista).post(`/api/mantenimientos/${id}/verificaciones`, cuerpo).expect(201);
      await api(tokens.analista).post(`/api/mantenimientos/${id}/verificaciones`, cuerpo).expect(409);
      const m = await api(tokens.auditor).get(`/api/mantenimientos/${id}`).expect(200);
      expect(m.body.cierre).toBe('CERRADO');
      const historial = await api(tokens.auditor).get(`/api/mantenimientos/${id}/verificaciones`).expect(200);
      expect(historial.body.map((v: { resultado: string }) => v.resultado)).toEqual(['NO_SATISFACTORIO', 'OPERATIVO']);
      const cerrados = await api(tokens.auditor).get('/api/mantenimientos?cierre=CERRADO').expect(200);
      expect(cerrados.body.meta.total).toBe(1);
    });
  });

  describe('vulnerabilidades · tres capas', () => {
    let idPc: number;
    let idMonitor: number;
    const base = {
      cve: 'CVE-2026-12345',
      descripcion: 'Servicio SMB expuesto con versión vulnerable.',
      nivelRiesgo: 'CRITICO',
      fecha: hace(2),
      fuente: 'BOLETIN_PROVEEDOR',
      evidencia: 'Informe del proveedor 2026-10',
    };

    it('lote: valida todos antes de crear; uno dado de baja rechaza el lote entero', async () => {
      await api(tokens.analista).post('/api/vulnerabilidades/lote', { ...base, activoIds: [ids.pc, ids.baja] }).expect(400);
      expect(await prisma.vulnerabilidad.count()).toBe(0);
    });

    it('lote: registra una por activo y avisa de las críticas', async () => {
      await api(tokens.auditor).post('/api/vulnerabilidades/lote', { ...base, activoIds: [ids.pc] }).expect(403);
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades/lote', { ...base, activoIds: [ids.pc, ids.monitor] })
        .expect(201);
      expect(res.body).toHaveLength(2);
      [idPc, idMonitor] = res.body.map((v: { id: number }) => v.id);
      expect(res.body[0]).toMatchObject({ estado: 'ABIERTA', fuente: 'BOLETIN_PROVEEDOR', confirmadaEn: null });
      expect(await avisos('VULNERABILIDAD_CRITICA')).toHaveLength(2);
    }, LENTO);

    it('filtros: por categoría del activo y por confirmación', async () => {
      const monitores = await api(tokens.auditor).get(`/api/vulnerabilidades?categoriaId=${ids.monitores}`).expect(200);
      expect(monitores.body.data.map((v: { id: number }) => v.id)).toEqual([idMonitor]);
      expect(monitores.body.data[0].activo.categoria).toBe('Monitores');
      const sinConfirmar = await api(tokens.auditor).get('/api/vulnerabilidades?confirmada=false').expect(200);
      expect(sinConfirmar.body.meta.total).toBe(2);
    });

    it('detectada → confirmada → evaluada; no se evalúa sin confirmar', async () => {
      const plan = { prioridad: 'P1', responsable: 'Seguridad TIC', planRemediacion: 'Deshabilitar SMBv1 y aplicar el parche.' };
      await api(tokens.analista).patch(`/api/vulnerabilidades/${idPc}/evaluar`, plan).expect(409);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${idPc}/confirmar`).expect(200);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${idPc}/confirmar`).expect(409);
      await api(tokens.analista).patch(`/api/vulnerabilidades/${idPc}/evaluar`, plan).expect(200);
      const v = await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id: idPc } });
      expect(v).toMatchObject({ confirmadaPor: 'analista.test', prioridad: 'P1', evaluadaPor: 'analista.test' });
      const p1 = await api(tokens.auditor).get('/api/vulnerabilidades?prioridad=P1').expect(200);
      expect(p1.body.meta.total).toBe(1);
    });

    it('cerrar sin acciones correctivas → 400; con acción y verificación → MITIGADA', async () => {
      await api(tokens.analista).patch(`/api/vulnerabilidades/${idPc}/iniciar-mitigacion`).expect(200);
      const verificacion = (resultado: string) => ({
        fecha: new Date().toISOString(),
        resultado,
        observaciones: resultado === 'CORREGIDA' ? 'Nuevo escaneo sin hallazgos.' : 'El puerto 445 sigue expuesto.',
        evidencia: 'Escaneo 2026-10-14',
        responsable: 'Seguridad TIC',
      });
      await api(tokens.analista).post(`/api/vulnerabilidades/${idPc}/verificaciones`, verificacion('CORREGIDA')).expect(400);
      await api(tokens.analista)
        .post(`/api/vulnerabilidades/${idPc}/acciones`, { fecha: new Date().toISOString(), descripcion: 'SMBv1 deshabilitado.', responsable: 'jperez' })
        .expect(201);
      await api(tokens.analista).post(`/api/vulnerabilidades/${idPc}/verificaciones`, verificacion('CORREGIDA')).expect(201);
      let v = await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id: idPc } });
      expect(v).toMatchObject({ estado: 'MITIGADA', cerradaPor: 'analista.test' });

      // Una comprobación posterior detecta que persiste: se reabre y avisa.
      await api(tokens.analista).post(`/api/vulnerabilidades/${idPc}/verificaciones`, verificacion('PERSISTE')).expect(201);
      v = await prisma.vulnerabilidad.findUniqueOrThrow({ where: { id: idPc } });
      expect(v).toMatchObject({ estado: 'EN_MITIGACION', fechaCierre: null, cerradaPor: null });
      expect(await avisos('VULNERABILIDAD_REABIERTA')).toHaveLength(1);

      const trazas = await api(tokens.auditor).get(`/api/trazas?entidad=VULNERABILIDAD&registroId=${idPc}`).expect(200);
      const motivos = trazas.body.map((t: { motivo: string }) => t.motivo).join(' | ');
      expect(motivos).toContain('Cerrada');
      expect(motivos).toContain('Reabierta');
      expect(motivos).toContain('confirmada');
      expect(motivos).toContain('Tratamiento iniciado');
    }, LENTO);

    it('solo el admin anula una acción correctiva', async () => {
      const [accion] = (await api(tokens.auditor).get(`/api/vulnerabilidades/${idPc}/acciones`).expect(200)).body;
      await api(tokens.analista).post(`/api/vulnerabilidades/acciones/${accion.id}/anular`, { motivo: MOTIVO }).expect(403);
      await api(tokens.admin).post(`/api/vulnerabilidades/acciones/${accion.id}/anular`, { motivo: MOTIVO }).expect(200);
      expect((await prisma.accionRemediacion.findUniqueOrThrow({ where: { id: accion.id } })).anuladoPor).toBe('admin.test');
    });
  });

  describe('respaldos · evidencia, filtros por categoría y aviso de fallo', () => {
    it('una ejecución FALLIDA guarda evidencia y observaciones y genera aviso', async () => {
      const [plan] = (
        await api(tokens.analista)
          .post('/api/respaldos/planes', {
            frecuencia: 'DIARIO',
            tipo: 'COMPLETO',
            medio: 'DISCO_A_DISCO',
            ventana: 'NOCTURNA_22_02',
            retencion: 'ANIO_1',
            frecuenciaPrueba: 'TRIMESTRAL',
            rpoHoras: 24,
            rtoMinutos: 240,
            responsable: 'Infraestructura',
            justificacion: 'Monitor de la sala de control con configuración propia.',
            activoIds: [ids.monitor],
          })
          .expect(201)
      ).body;
      await api(tokens.analista)
        .post('/api/respaldos/ejecuciones', {
          planId: plan.id,
          fecha: hace(1).slice(0, 10),
          tipo: 'COMPLETO',
          medio: 'DISCO_A_DISCO',
          volumenGb: 1,
          duracionMin: 5,
          rpoHoras: 24,
          resultado: 'FALLIDO',
          responsable: 'Infraestructura',
          cifrado: true,
          fueraSitio: false,
          inmutable: false,
          integridad: false,
          evidencia: 'Registro del software de respaldo',
          observaciones: 'Disco de destino lleno.',
        })
        .expect(201);
      const e = await prisma.ejecucionRespaldo.findFirstOrThrow({ where: { planId: plan.id } });
      expect(e).toMatchObject({ evidencia: 'Registro del software de respaldo', observaciones: 'Disco de destino lleno.' });
      expect(await avisos('RESPALDO_FALLIDO')).toHaveLength(1);

      const porCategoria = await api(tokens.auditor).get(`/api/respaldos/ejecuciones?categoriaId=${ids.monitores}`).expect(200);
      expect(porCategoria.body.meta.total).toBe(1);
      const otraCategoria = await api(tokens.auditor).get(`/api/respaldos/ejecuciones?categoriaId=${ids.computadoras}`).expect(200);
      expect(otraCategoria.body.meta.total).toBe(0);
      const porResponsable = await api(tokens.auditor).get('/api/respaldos/ejecuciones?responsable=Infra').expect(200);
      expect(porResponsable.body.meta.total).toBe(1);
    }, LENTO);
  });
});
