/**
 * Pruebas e2e del módulo de vulnerabilidades contra MySQL
 * (gestion_activos_test) y el Keycloak de desarrollo.
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

describe('Vulnerabilidades (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: Awaited<ReturnType<typeof getTokensDePrueba>>;
  let activoId: number;
  let activoDeBajaId: number;

  const DIA = 24 * 3600 * 1000;
  const HACE_3_DIAS = new Date(Date.now() - 3 * DIA).toISOString();
  const AYER = new Date(Date.now() - DIA).toISOString();
  const EN_UNA_SEMANA = new Date(Date.now() + 7 * DIA).toISOString();

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();

    prisma = app.get(PrismaService);
    await limpiarBaseDeDatos(prisma);
    tokens = await getTokensDePrueba();

    const categoria = await prisma.categoria.create({
      data: { nombre: 'Hardware', descripcion: '' },
    });
    const criticidad = await prisma.criticidad.create({
      data: { nivel: 'Alta' },
    });
    const base = {
      nombre: 'Servidor web',
      sistemas: 'Portal',
      custodio: 'Infraestructura',
      ubicacion: 'DMZ',
      cifrado: true,
      ultimaRevision: new Date('2026-09-01'),
      categoriaId: categoria.id,
      criticidadId: criticidad.id,
    };
    activoId = (
      await prisma.activo.create({ data: { ...base, codigo: 'WEB-01' } })
    ).id;
    activoDeBajaId = (
      await prisma.activo.create({
        data: { ...base, codigo: 'WEB-OLD', deletedAt: new Date() },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = (token: string) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body: object) =>
        auth(request(server).post(url).send(body)),
      patch: (url: string, body: object = {}) =>
        auth(request(server).patch(url).send(body)),
    };
  };

  const registrar = async (extra: Record<string, unknown> = {}) =>
    (
      await api(tokens.analista)
        .post('/api/vulnerabilidades', {
          activoId,
          descripcion: 'Versión de OpenSSL con vulnerabilidad conocida.',
          nivelRiesgo: 'MEDIO',
          fecha: HACE_3_DIAS,
          ...extra,
        })
        .expect(201)
    ).body as { id: number };

  describe('ciclo completo: registrar → iniciar mitigación → mitigar', () => {
    let id: number;

    it('registrar → 201 ABIERTA, con el CVE normalizado a mayúsculas', async () => {
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades', {
          activoId,
          cve: '  cve-2026-12345 ',
          descripcion: '  OpenSSL vulnerable a desbordamiento de búfer.  ',
          nivelRiesgo: 'ALTO',
          fecha: HACE_3_DIAS,
          fechaLimite: EN_UNA_SEMANA,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        activo: { id: activoId, codigo: 'WEB-01' },
        cve: 'CVE-2026-12345',
        descripcion: 'OpenSSL vulnerable a desbordamiento de búfer.',
        nivelRiesgo: 'ALTO',
        estado: 'ABIERTA',
        vencida: false,
        mitigacion: null,
        fechaLimite: EN_UNA_SEMANA,
        fechaCierre: null,
      });
      id = res.body.id;
    });

    it('el mismo CVE no puede estar pendiente dos veces en el activo → 409', async () => {
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades', {
          activoId,
          cve: 'CVE-2026-12345',
          descripcion: 'Duplicado',
          nivelRiesgo: 'ALTO',
          fecha: HACE_3_DIAS,
        })
        .expect(409);
      expect(res.body.message).toMatch(/ya tiene CVE-2026-12345 pendiente/);
    });

    it('no se puede mitigar sin haber iniciado la mitigación → 409', () =>
      api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/mitigar`, { mitigacion: 'X' })
        .expect(409));

    it('iniciar mitigación → EN_MITIGACION', async () => {
      const res = await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`)
        .expect(200);
      expect(res.body.estado).toBe('EN_MITIGACION');
    });

    it('no se puede iniciar dos veces → 409', () =>
      api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`)
        .expect(409));

    it('mitigar → MITIGADA con la acción aplicada y fecha de cierre automática', async () => {
      const antes = Date.now();
      const res = await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/mitigar`, {
          mitigacion: 'Actualizado OpenSSL a 3.0.15; verificado con escaneo.',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        estado: 'MITIGADA',
        mitigacion: 'Actualizado OpenSSL a 3.0.15; verificado con escaneo.',
        vencida: false,
      });
      expect(new Date(res.body.fechaCierre).getTime()).toBeGreaterThanOrEqual(
        antes - 1000,
      );
    });

    it('cerrada, ya no admite aceptar el riesgo → 409', () =>
      api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, {
          justificacion: 'X',
        })
        .expect(409));

    it('una vez cerrada, el mismo CVE se puede volver a registrar (reapareció)', () =>
      registrar({ cve: 'CVE-2026-12345' }));
  });

  describe('aceptar el riesgo (solo admin)', () => {
    it('analista NO puede aceptar riesgos → 403', async () => {
      const { id } = await registrar({ descripcion: 'Sistema heredado' });
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, {
          justificacion: 'Sin parche',
        })
        .expect(403);
    });

    it('admin acepta desde ABIERTA → ACEPTADA con la justificación', async () => {
      const { id } = await registrar({
        descripcion: 'Sin parche del fabricante',
      });
      const res = await api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, {
          justificacion: 'Aislado en VLAN sin acceso a Internet.',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        estado: 'ACEPTADA',
        mitigacion: 'Aislado en VLAN sin acceso a Internet.',
        fechaCierre: expect.any(String),
      });
    });

    it('admin acepta desde EN_MITIGACION', async () => {
      const { id } = await registrar({ descripcion: 'Mitigación inviable' });
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`)
        .expect(200);
      const res = await api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, {
          justificacion: 'El parche rompe el sistema.',
        })
        .expect(200);
      expect(res.body.estado).toBe('ACEPTADA');
    });

    it('aceptar sin justificación → 400', async () => {
      const { id } = await registrar({ descripcion: 'Sin justificación' });
      await api(tokens.admin)
        .patch(`/api/vulnerabilidades/${id}/aceptar-riesgo`, {})
        .expect(400);
    });
  });

  describe('validaciones', () => {
    it('activo inexistente o dado de baja → 400', async () => {
      const cuerpo = { descripcion: 'X', nivelRiesgo: 'BAJO', fecha: AYER };
      await api(tokens.analista)
        .post('/api/vulnerabilidades', { ...cuerpo, activoId: 999999 })
        .expect(400);
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades', { ...cuerpo, activoId: activoDeBajaId })
        .expect(400);
      expect(res.body.message).toMatch(/dado de baja/);
    });

    it('CVE con formato inválido → 400', async () => {
      const cuerpo = {
        activoId,
        descripcion: 'X',
        nivelRiesgo: 'BAJO',
        fecha: AYER,
      };
      for (const cve of [
        '2026-12345',
        'CVE-26-12345',
        'CVE-2026-123',
        'CVE-2026-ABCD',
      ]) {
        const res = await api(tokens.analista)
          .post('/api/vulnerabilidades', { ...cuerpo, cve })
          .expect(400);
        expect(res.body.message).toContain(
          'cve debe tener el formato CVE-AAAA-NNNN (p. ej. CVE-2026-12345)',
        );
      }
    });

    it('nivel de riesgo inválido, fecha futura o campos extra → 400', async () => {
      const cuerpo = {
        activoId,
        descripcion: 'X',
        nivelRiesgo: 'BAJO',
        fecha: AYER,
      };
      await api(tokens.analista)
        .post('/api/vulnerabilidades', { ...cuerpo, nivelRiesgo: 'URGENTE' })
        .expect(400);
      await api(tokens.analista)
        .post('/api/vulnerabilidades', { ...cuerpo, fecha: EN_UNA_SEMANA })
        .expect(400);
      await api(tokens.analista)
        .post('/api/vulnerabilidades', { ...cuerpo, estado: 'MITIGADA' })
        .expect(400);
    });

    it('fecha límite anterior a la detección → 400', async () => {
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades', {
          activoId,
          descripcion: 'X',
          nivelRiesgo: 'BAJO',
          fecha: AYER,
          fechaLimite: HACE_3_DIAS,
        })
        .expect(400);
      expect(res.body.message).toMatch(/anterior a la fecha de detección/);
    });

    it('descripción larga (TEXT) se acepta', async () => {
      const larga = 'Detalle técnico. '.repeat(150); // ~2 550 caracteres
      const res = await api(tokens.analista)
        .post('/api/vulnerabilidades', {
          activoId,
          descripcion: larga,
          nivelRiesgo: 'BAJO',
          fecha: AYER,
        })
        .expect(201);
      expect(res.body.descripcion).toBe(larga.trim());
    });

    it('inexistente → 404; id no numérico → 400', async () => {
      await api(tokens.auditor).get('/api/vulnerabilidades/999999').expect(404);
      await api(tokens.analista)
        .patch('/api/vulnerabilidades/999999/iniciar-mitigacion')
        .expect(404);
      await api(tokens.auditor).get('/api/vulnerabilidades/abc').expect(400);
    });
  });

  describe('permisos por rol', () => {
    it('el auditor puede consultar pero no registrar ni cambiar el estado → 403', async () => {
      const { id } = await registrar({ descripcion: 'Permisos' });
      await api(tokens.auditor).get(`/api/vulnerabilidades/${id}`).expect(200);
      await api(tokens.auditor)
        .post('/api/vulnerabilidades', {
          activoId,
          descripcion: 'X',
          nivelRiesgo: 'BAJO',
          fecha: AYER,
        })
        .expect(403);
      await api(tokens.auditor)
        .patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`)
        .expect(403);
    });
  });

  describe('consulta (GET /api/vulnerabilidades)', () => {
    let vencidaId: number;
    let criticaId: number;

    beforeAll(async () => {
      await limpiarVulnerabilidades();
      await registrar({
        descripcion: 'Baja',
        nivelRiesgo: 'BAJO',
        fecha: AYER,
      });
      await registrar({
        descripcion: 'Media antigua',
        nivelRiesgo: 'MEDIO',
        fecha: HACE_3_DIAS,
      });
      await registrar({
        descripcion: 'Media reciente',
        nivelRiesgo: 'MEDIO',
        fecha: AYER,
      });
      criticaId = (
        await registrar({
          descripcion: 'Crítica',
          nivelRiesgo: 'CRITICO',
          fecha: AYER,
        })
      ).id;
      vencidaId = (
        await registrar({
          descripcion: 'Alta vencida',
          nivelRiesgo: 'ALTO',
          fecha: HACE_3_DIAS,
          fechaLimite: AYER,
        })
      ).id;
    });

    async function limpiarVulnerabilidades() {
      await prisma.vulnerabilidad.deleteMany();
    }

    it('orden por defecto: mayor riesgo primero y, en el mismo nivel, la más antigua', async () => {
      const res = await api(tokens.auditor)
        .get('/api/vulnerabilidades')
        .expect(200);
      expect(
        res.body.data.map((v: { descripcion: string }) => v.descripcion),
      ).toEqual([
        'Crítica',
        'Alta vencida',
        'Media antigua',
        'Media reciente',
        'Baja',
      ]);
      expect(res.body.data[0].id).toBe(criticaId);
    });

    it('vencidas: pendiente con fecha límite pasada (campo y filtro)', async () => {
      const detalle = await api(tokens.auditor)
        .get(`/api/vulnerabilidades/${vencidaId}`)
        .expect(200);
      expect(detalle.body.vencida).toBe(true);

      const res = await api(tokens.auditor)
        .get('/api/vulnerabilidades?vencidas=true')
        .expect(200);
      expect(res.body.data.map((v: { id: number }) => v.id)).toEqual([
        vencidaId,
      ]);
    });

    it('abiertas=true / false y filtro por nivel de riesgo', async () => {
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${criticaId}/iniciar-mitigacion`)
        .expect(200);
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${criticaId}/mitigar`, {
          mitigacion: 'Parcheado',
        })
        .expect(200);

      const abiertas = await api(tokens.auditor)
        .get('/api/vulnerabilidades?abiertas=true')
        .expect(200);
      expect(abiertas.body.meta.total).toBe(4);

      const cerradas = await api(tokens.auditor)
        .get('/api/vulnerabilidades?abiertas=false')
        .expect(200);
      expect(cerradas.body.data.map((v: { id: number }) => v.id)).toEqual([
        criticaId,
      ]);

      const medias = await api(tokens.auditor)
        .get('/api/vulnerabilidades?nivelRiesgo=MEDIO')
        .expect(200);
      expect(medias.body.meta.total).toBe(2);
    });

    it('búsqueda por CVE (parcial, sin importar mayúsculas)', async () => {
      const { id } = await registrar({
        cve: 'CVE-2025-99999',
        descripcion: 'Con CVE',
      });
      const res = await api(tokens.auditor)
        .get('/api/vulnerabilidades?cve=cve-2025')
        .expect(200);
      expect(res.body.data.map((v: { id: number }) => v.id)).toEqual([id]);
    });

    it('?actualizadoDesde devuelve solo lo modificado después de esa fecha', async () => {
      const { id } = await registrar({ descripcion: 'Sincronización' });
      const desde = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 20));
      await api(tokens.analista)
        .patch(`/api/vulnerabilidades/${id}/iniciar-mitigacion`)
        .expect(200);
      const res = await api(tokens.auditor)
        .get(
          `/api/vulnerabilidades?actualizadoDesde=${encodeURIComponent(desde)}`,
        )
        .expect(200);
      expect(res.body.data.map((v: { id: number }) => v.id)).toEqual([id]);
    });

    it('filtros inválidos → 400', async () => {
      await api(tokens.auditor)
        .get('/api/vulnerabilidades?estado=CERRADA')
        .expect(400);
      await api(tokens.auditor)
        .get('/api/vulnerabilidades?vencidas=quizas')
        .expect(400);
    });
  });

  it('Swagger documenta las rutas de vulnerabilidades', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/vulnerabilidades',
        '/api/vulnerabilidades/{id}',
        '/api/vulnerabilidades/{id}/iniciar-mitigacion',
        '/api/vulnerabilidades/{id}/mitigar',
        '/api/vulnerabilidades/{id}/aceptar-riesgo',
      ]),
    );
  });
});
