/**
 * Bitácoras OPERATIVAS (el Excel no define indicador): movimientos del Inventario (manual o GLPI)
 * y Renovaciones registradas o ejecutadas en el período. Solo lectura. Base gestion_activos_test.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { diaLocal } from './../src/common/plazos/plazos.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupSwagger } from './../src/swagger.js';
import { APLICA_EN_TODOS, limpiarBaseDeDatos } from './utils/database.js';
import { getTokensDePrueba } from './utils/keycloak.js';

const LENTO = 90_000;
const HOY = diaLocal(new Date());
const [ANIO, MES] = HOY.split('-').map(Number);

describe('Bitácoras operativas: Inventario y Renovaciones (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let otroId: number;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();
    const categoriaId = (await prisma.categoria.create({ data: { ...APLICA_EN_TODOS, nombre: 'Servidores', descripcion: '' } })).id;
    const criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Alta' } })).id;
    const srv = request(app.getHttpServer());
    // Alta y modificación MANUALES por la API.
    activoId = (
      await srv.post('/api/activos').set('Authorization', `Bearer ${tokens.analista}`)
        .send({ codigo: 'SRV-BIT', nombre: 'Servidor de bitácora', sistemas: 'ERP', custodio: 'Infra', ubicacion: 'Rack 3', cifrado: true, ultimaRevision: '2026-09-15T00:00:00.000Z', categoriaId, criticidadId })
        .expect(201)
    ).body.id;
    await srv.patch(`/api/activos/${activoId}`).set('Authorization', `Bearer ${tokens.analista}`).send({ ubicacion: 'Rack 7' }).expect(200);
    // Inactivación de la SINCRONIZACIÓN (como la escribe glpi-sync).
    otroId = (await prisma.activo.create({ data: { codigo: 'GLPI-PC-9', nombre: 'Equipo retirado', sistemas: '', custodio: '', ubicacion: '', cifrado: false, ultimaRevision: new Date(), categoriaId, criticidadId } })).id;
    await prisma.bitacoraHistorial.create({
      data: { activoId: otroId, accion: 'INACTIVAR', responsable: 'GLPI', fecha: new Date(), detalle: JSON.stringify({ inactivoDesde: { antes: null, despues: new Date().toISOString() }, motivoInactivo: { antes: null, despues: 'AUSENTE_EN_GLPI' } }) },
    });
    // Un movimiento de otro año no aparece en este.
    await prisma.bitacoraHistorial.create({ data: { activoId: otroId, accion: 'ACTUALIZAR', responsable: 'GLPI', fecha: new Date('2024-05-05T12:00:00Z'), detalle: '{}' } });

    // Renovaciones: una registrada este año (pendiente), una ejecutada este año, una anulada y una de 2024.
    const ren = (extra: object) =>
      prisma.renovacion.create({ data: { activoId, tipo: 'LICENCIA', responsable: 'COMPRAS', fechaPlanificada: new Date(`${ANIO}-12-01`), fechaCaducidadActual: new Date(`${ANIO}-12-31`), ...extra } });
    await ren({});
    await ren({ estado: 'CERRADO', fechaRenovacion: new Date(`${ANIO}-${String(MES).padStart(2, '0')}-01`), nuevaFechaCaducidad: new Date(`${ANIO + 1}-12-31`), evidencia: 'Factura 123', repositorioVerificable: 'Carpeta TIC', createdAt: new Date('2024-01-10T12:00:00Z') });
    await ren({ anuladoEn: new Date(), anuladoPor: 'admin.test', motivoAnulacion: 'Duplicada.' });
    await ren({ createdAt: new Date('2024-03-01T12:00:00Z') });
  }, LENTO);

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token = tokens.auditor) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  describe('Inventario: bitácora de movimientos', () => {
    it('lista altas, modificaciones e inactivaciones del período con usuario, valores y origen', async () => {
      const r = (await get(`/api/activos/bitacora?anio=${ANIO}`).expect(200)).body as { meta: { total: number }; data: { accion: string; origen: string; responsable: string; motivo: string | null; activo: { codigo: string }; detalle: Record<string, { antes: unknown; despues: unknown }> }[] };
      expect(r.meta.total).toBe(3);
      const de = (accion: string) => r.data.find((m) => m.accion === accion)!;
      expect(de('CREAR')).toMatchObject({ origen: 'MANUAL', responsable: 'analista.test', activo: { codigo: 'SRV-BIT' } });
      expect(de('ACTUALIZAR')).toMatchObject({ origen: 'MANUAL', detalle: { ubicacion: { antes: 'Rack 3', despues: 'Rack 7' } } });
      expect(de('INACTIVAR')).toMatchObject({ origen: 'GLPI', motivo: 'AUSENTE_EN_GLPI', activo: { codigo: 'GLPI-PC-9' } });
      expect(de('CREAR').motivo).toBeNull();
    });

    it('filtros: origen, operación, mes y búsqueda por código', async () => {
      expect((await get(`/api/activos/bitacora?anio=${ANIO}&origen=GLPI`).expect(200)).body.meta.total).toBe(1);
      expect((await get(`/api/activos/bitacora?anio=${ANIO}&origen=MANUAL`).expect(200)).body.meta.total).toBe(2);
      expect((await get(`/api/activos/bitacora?anio=${ANIO}&accion=ACTUALIZAR`).expect(200)).body.meta.total).toBe(1);
      expect((await get(`/api/activos/bitacora?anio=${ANIO}&mes=${MES}&q=SRV-BIT`).expect(200)).body.meta.total).toBe(2);
      expect((await get('/api/activos/bitacora?anio=2024').expect(200)).body.meta.total).toBe(1);
    });

    it('solo consulta: no cambia el activo y la ruta no choca con /activos/:id', async () => {
      const antes = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
      await get(`/api/activos/bitacora?anio=${ANIO}`).expect(200);
      expect(await prisma.activo.findUniqueOrThrow({ where: { id: activoId } })).toEqual(antes);
      await get(`/api/activos/${activoId}`).expect(200);
      await get('/api/activos/bitacora').expect(400);
    });
  });

  describe('Renovaciones: bitácora operativa', () => {
    it('registradas o ejecutadas en el período, sin anuladas', async () => {
      const r = (await get(`/api/renovaciones/bitacora?anio=${ANIO}`).expect(200)).body as { meta: { total: number }; data: { estado: string; fechaRenovacion: string | null; fechaCaducidadActual: string | null; nuevaFechaCaducidad: string | null }[] };
      expect(r.meta.total).toBe(2);
      const cerrada = r.data.find((x) => x.estado === 'CERRADO')!;
      expect(cerrada).toMatchObject({ fechaCaducidadActual: `${ANIO}-12-31T00:00:00.000Z`, nuevaFechaCaducidad: `${ANIO + 1}-12-31T00:00:00.000Z` });
      expect((await get('/api/renovaciones/bitacora?anio=2024').expect(200)).body.meta.total).toBe(2);
    });

    it('filtros del listado y validación', async () => {
      expect((await get(`/api/renovaciones/bitacora?anio=${ANIO}&estado=CERRADO`).expect(200)).body.meta.total).toBe(1);
      expect((await get(`/api/renovaciones/bitacora?anio=${ANIO}&q=SRV-BIT`).expect(200)).body.meta.total).toBe(2);
      await get('/api/renovaciones/bitacora').expect(400);
      await get(`/api/renovaciones/bitacora?anio=${ANIO}`, tokens.admin).expect(200);
    });
  });
});
