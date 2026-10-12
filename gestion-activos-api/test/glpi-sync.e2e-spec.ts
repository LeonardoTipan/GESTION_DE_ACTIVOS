/**
 * Pruebas de integración de la sincronización con GLPI contra MySQL REAL
 * (base gestion_activos_test, que se vacía al empezar). GLPI es simulado: la
 * lógica de identidad no depende de ningún servidor de producción.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './../src/generated/prisma/client.js';
import type { GlpiSyncConfig } from './../src/glpi-sync/config.js';
import { GlpiClient } from './../src/glpi-sync/glpi-client.js';
import { InventarioPrisma } from './../src/glpi-sync/inventario-local.js';
import { Sincronizador } from './../src/glpi-sync/sincronizador.js';
import {
  CREDENCIALES_PRUEBA,
  glpiFalso,
  type DatosGlpiFalso,
} from './../src/glpi-sync/testing/glpi-falso.js';
import {
  CODIGOS_ESPERADOS,
  equipoDeRed,
  ordenador,
  ordenadores,
  REGLA,
} from './../src/glpi-sync/testing/inventario-ejemplo.js';
import { BitacoraService } from './../src/inventory/bitacora/bitacora.service.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { limpiarBaseDeDatos } from './utils/database.js';

const LENTO = 120_000; // la conexión a MySQL desde Windows puede tardar varios segundos

const CONFIG: GlpiSyncConfig = {
  apiUrl: 'https://glpi.test/api.php',
  apiVersion: 'v2',
  ignorarSsl: false,
  credenciales: CREDENCIALES_PRUEBA,
  zonaHoraria: 'America/Guayaquil',
  itemtypes: ['Computer', 'NetworkEquipment'],
  tamanoBloque: 50,
  dryRun: false,
  mejorarCodigos: false,
  cron: '0 2 * * *',
  criticidadPorDefecto: 'Media',
  codigoInstitucional: REGLA,
  categoriaPorTipo: { Computer: 'Hardware', NetworkEquipment: 'Red', Software: 'Software' },
  dirInformes: 'glpi-informes',
  timeoutMs: 5000,
  databaseUrl: process.env.DATABASE_URL!,
};

const INVENTARIO = (): DatosGlpiFalso => ({
  elementos: { Computer: ordenadores(), NetworkEquipment: [equipoDeRed()] },
});

describe('Sincronización con GLPI (integración con MySQL)', () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let criticidadId: number;

  /** Motor real (Prisma + bitácora) con un GLPI simulado. */
  const motor = (
    datos: DatosGlpiFalso,
    config: Partial<GlpiSyncConfig> = {},
    cliente: PrismaClient = prisma,
  ) => {
    const completa = { ...CONFIG, ...config };
    return new Sincronizador(
      completa,
      new GlpiClient({ ...completa, fetch: glpiFalso(datos).fetch }),
      new InventarioPrisma(cliente, new BitacoraService(cliente as PrismaService)),
      () => {},
    );
  };

  const vaciarActivos = async () => {
    await prisma.bitacoraHistorial.deleteMany();
    await prisma.activo.deleteMany();
  };

  const manual = (codigo: string, extra: object = {}) =>
    prisma.activo.create({
      data: {
        codigo,
        nombre: 'Equipo registrado a mano',
        sistemas: 'Windows 10',
        custodio: 'Juan Pérez',
        ubicacion: 'Gerencia',
        cifrado: true,
        ultimaRevision: new Date('2026-01-10T00:00:00.000Z'),
        categoriaId,
        criticidadId,
        ...extra,
      },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
    });
    await limpiarBaseDeDatos(prisma as PrismaService);
    categoriaId = (
      await prisma.categoria.create({
        data: { nombre: 'Hardware', descripcion: 'Equipos físicos' },
      })
    ).id;
    await prisma.categoria.create({
      data: { nombre: 'Red', descripcion: 'Equipos de comunicaciones' },
    });
    criticidadId = (await prisma.criticidad.create({ data: { nivel: 'Media' } })).id;
  }, LENTO);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('importación inicial', () => {
    beforeAll(vaciarActivos, LENTO);

    it(
      'crea los 25 ordenadores y el equipo de red como 26 activos distintos',
      async () => {
        const informe = await motor(INVENTARIO()).ejecutar();
        expect(informe.errores).toEqual([]);
        expect(informe.totales.Computer).toMatchObject({ leidos: 25, CREAR: 25, ERROR: 0 });
        expect(informe.totales.NetworkEquipment).toMatchObject({ leidos: 1, CREAR: 1, ERROR: 0 });

        const activos = await prisma.activo.findMany();
        expect(activos).toHaveLength(26);
        expect(new Set(activos.map((a) => a.origenGlpi)).size).toBe(26);
        expect(new Set(activos.map((a) => a.codigo.toLowerCase())).size).toBe(26);
        expect(activos.filter((a) => a.numeroInventario === '001')).toHaveLength(23); // 22 PC + red
      },
      LENTO,
    );

    it('cada activo tiene el código operativo esperado y conserva sus datos de origen', async () => {
      const pcs = await prisma.activo.findMany({
        where: { origenGlpi: { startsWith: 'Computer #' } },
      });
      const codigos = Object.fromEntries(
        pcs.map((a) => [Number(a.origenGlpi!.split('#')[1]), a.codigo]),
      );
      expect(codigos).toEqual(CODIGOS_ESPERADOS);

      const pc1 = pcs.find((a) => a.origenGlpi === 'Computer #1')!;
      const red1 = await prisma.activo.findUniqueOrThrow({
        where: { origenGlpi: 'NetworkEquipment #1' },
      });
      expect(pc1.id).not.toBe(red1.id);
      expect(pc1).toMatchObject({
        codigo: 'GLPI-PC-1', // su código institucional está repetido con el #10
        codigoInstitucional: '7-1-22-177',
        numeroInventario: '001',
        numeroSerie: 'SERIE-1',
        tipo: 'Laptop',
        tecnicoResponsable: 'soporte',
        direccionIp: null, // GLPI no la informa: no se inventa
        fechaCompra: null,
      });
      // -05:00 → UTC, sin perder el instante.
      expect(pc1.fechaAlta?.toISOString()).toBe('2026-05-11T18:56:57.000Z');
      expect(pc1.comentario).toContain('\nSistema Operativo Windows 11 Pro\n');
    });

    it('el historial de cada alta está firmado por GLPI e incluye la referencia de origen', async () => {
      const entradas = await prisma.bitacoraHistorial.findMany();
      expect(entradas).toHaveLength(26);
      expect(entradas.every((e) => e.responsable === 'GLPI' && e.accion === 'CREAR')).toBe(true);
      const detalle = JSON.parse(entradas[0].detalle) as Record<string, { despues: unknown }>;
      expect(String(detalle.origenGlpi.despues)).toMatch(/^Computer #\d+$/);
    });

    it(
      'segunda sincronización idéntica: no crea, no modifica y no añade historial',
      async () => {
        const antes = await prisma.activo.findMany({ orderBy: { id: 'asc' } });
        const informe = await motor(INVENTARIO()).ejecutar();
        expect(informe.totales.Computer).toMatchObject({ CREAR: 0, ACTUALIZAR: 0, SIN_CAMBIOS: 25 });
        expect(informe.totales.NetworkEquipment).toMatchObject({ SIN_CAMBIOS: 1 });
        expect(await prisma.activo.findMany({ orderBy: { id: 'asc' } })).toEqual(antes);
        expect(await prisma.bitacoraHistorial.count()).toBe(26);
      },
      LENTO,
    );

    it(
      'la simulación no escribe: mismo contenido y misma fecha de modificación',
      async () => {
        const antes = await prisma.activo.findMany({ orderBy: { id: 'asc' } });
        const datos = INVENTARIO();
        datos.elementos.Computer[0] = { ...ordenador(1, '001', '7-1-22-177'), name: 'Nombre cambiado' };
        datos.elementos.Computer.push(ordenador(99, 'INV-99', '7-1-22-990'));
        const informe = await motor(datos, { dryRun: true }).ejecutar();
        expect(informe.totales.Computer).toMatchObject({ CREAR: 1, ACTUALIZAR: 1 });
        expect(await prisma.activo.findMany({ orderBy: { id: 'asc' } })).toEqual(antes);
        expect(await prisma.bitacoraHistorial.count()).toBe(26);
      },
      LENTO,
    );

    it(
      'cambio del n.º de inventario en GLPI: actualiza el mismo activo y lo firma GLPI',
      async () => {
        const antes = await prisma.activo.findUniqueOrThrow({ where: { origenGlpi: 'Computer #2' } });
        const datos = INVENTARIO();
        datos.elementos.Computer[1] = ordenador(2, 'INV-NUEVO-2', '7-1-22-69');
        const informe = await motor(datos).ejecutar();
        expect(informe.totales.Computer).toMatchObject({ CREAR: 0, ACTUALIZAR: 1, SIN_CAMBIOS: 24 });

        const despues = await prisma.activo.findUniqueOrThrow({ where: { origenGlpi: 'Computer #2' } });
        expect(despues).toMatchObject({ id: antes.id, codigo: antes.codigo, numeroInventario: 'INV-NUEVO-2' });
        expect(await prisma.activo.count()).toBe(26);
        const ultima = await prisma.bitacoraHistorial.findFirstOrThrow({
          where: { activoId: antes.id },
          orderBy: { id: 'desc' },
        });
        expect(ultima).toMatchObject({ accion: 'ACTUALIZAR', responsable: 'GLPI' });
        expect(JSON.parse(ultima.detalle)).toEqual({
          numeroInventario: { antes: '001', despues: 'INV-NUEVO-2' },
        });
      },
      LENTO,
    );

    it(
      'error temporal de GLPI: no se borra ni se da de baja ningún activo',
      async () => {
        const antes = await prisma.activo.findMany({ orderBy: { id: 'asc' } });
        const informe = await motor({
          ...INVENTARIO(),
          rutasRotas: ['/v2/Assets/Computer', '/v2/Assets/NetworkEquipment'],
        }).ejecutar();
        expect(informe.errores).toHaveLength(2);
        expect(await prisma.activo.findMany({ orderBy: { id: 'asc' } })).toEqual(antes);
      },
      LENTO,
    );

    it('la base rechaza por sí misma una referencia de GLPI o un código repetidos', async () => {
      await expect(manual('OTRO-CODIGO', { origenGlpi: 'Computer #1' })).rejects.toMatchObject({ code: 'P2002' });
      await expect(manual('glpi-pc-1')).rejects.toMatchObject({ code: 'P2002' });
      expect(await prisma.activo.count()).toBe(26);
    });
  });

  describe('concurrencia', () => {
    beforeAll(vaciarActivos, LENTO);

    it(
      'dos sincronizaciones simultáneas (conexiones distintas) no duplican referencias ni códigos',
      async () => {
        const otra = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
        try {
          const [a, b] = await Promise.all([
            motor(INVENTARIO()).ejecutar(),
            motor(INVENTARIO(), {}, otra).ejecutar(),
          ]);
          const activos = await prisma.activo.findMany();
          expect(activos).toHaveLength(26);
          expect(new Set(activos.map((x) => x.origenGlpi)).size).toBe(26);
          // Un historial por activo: la transacción deshace el alta que pierde la carrera.
          expect(await prisma.bitacoraHistorial.count()).toBe(26);

          const elementos = [...a.elementos, ...b.elementos];
          const errores = elementos.filter((e) => e.resultado === 'ERROR');
          expect(errores.every((e) => e.error!.includes('impidió el duplicado'))).toBe(true);
          expect(elementos.filter((e) => e.resultado === 'CREAR')).toHaveLength(26);

          const despues = await motor(INVENTARIO()).ejecutar();
          expect(despues.totales.Computer).toMatchObject({ CREAR: 0, SIN_CAMBIOS: 25, ERROR: 0 });
        } finally {
          await otra.$disconnect();
        }
      },
      LENTO,
    );
  });

  describe('activos registrados a mano', () => {
    beforeEach(vaciarActivos, LENTO);

    const unico = (): DatosGlpiFalso => ({
      elementos: { Computer: [ordenador(40, 'INV-40', '7-1-22-400')], NetworkEquipment: [] },
    });

    it(
      'coincidencia inequívoca: se vincula sin duplicar, conservando sus datos locales',
      async () => {
        const previo = await manual('INV-40', { direccionIp: '10.0.0.40' });
        const informe = await motor(unico()).ejecutar();
        expect(informe.elementos[0]).toMatchObject({ resultado: 'ENLAZAR', activoId: previo.id });

        const activos = await prisma.activo.findMany();
        expect(activos).toHaveLength(1);
        expect(activos[0]).toMatchObject({
          id: previo.id,
          codigo: 'INV-40',
          origenGlpi: 'Computer #40',
          cifrado: true,
          direccionIp: '10.0.0.40', // dato local que GLPI no conoce
          ultimaRevision: previo.ultimaRevision,
          custodio: 'usuario40',
        });
        // El valor anterior queda en el historial: nada se pierde en silencio.
        const entrada = await prisma.bitacoraHistorial.findFirstOrThrow({ where: { activoId: previo.id } });
        expect(entrada.responsable).toBe('GLPI');
        expect(JSON.parse(entrada.detalle)).toMatchObject({
          custodio: { antes: 'Juan Pérez', despues: 'usuario40' },
          origenGlpi: { antes: null, despues: 'Computer #40' },
        });
      },
      LENTO,
    );

    it(
      'coincidencia ambigua (inventario "001" repetido en GLPI): el activo manual no se toca',
      async () => {
        const previo = await manual('001');
        const informe = await motor(INVENTARIO()).ejecutar();
        expect(informe.elementos.filter((e) => e.resultado === 'ENLAZAR')).toEqual([]);
        expect(await prisma.activo.count()).toBe(27);
        expect(await prisma.activo.findUniqueOrThrow({ where: { id: previo.id } })).toEqual(previo);
        expect(await prisma.bitacoraHistorial.count({ where: { activoId: previo.id } })).toBe(0);
      },
      LENTO,
    );
  });

  describe('integridad: registros huérfanos', () => {
    beforeAll(vaciarActivos, LENTO);

    it(
      'con un registro huérfano la sincronización real NO escribe nada',
      async () => {
        // Como en el incidente real: un respaldo que apunta a un activo borrado.
        await prisma.$transaction([
          prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
          prisma.$executeRawUnsafe(
            "INSERT INTO respaldo (activoId, alcanceDetalle, updatedAt) VALUES (1, 'huérfano', NOW(3))",
          ),
          prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
        ]);
        try {
          const informe = await motor(INVENTARIO()).ejecutar();
          expect(informe.errores[0]).toContain('1 en respaldo');
          expect(informe.errores[0]).toContain('No se escribe nada');
          expect(await prisma.activo.count()).toBe(0);

          // La simulación sí informa, avisando del bloqueo.
          const simulacion = await motor(INVENTARIO(), { dryRun: true }).ejecutar();
          expect(simulacion.errores[0]).toContain('se negaría a escribir');
          expect(simulacion.totales.Computer).toMatchObject({ CREAR: 25 });
        } finally {
          await prisma.respaldo.deleteMany();
        }
        // Resuelto el huérfano, importa con normalidad.
        const informe = await motor(INVENTARIO()).ejecutar();
        expect(informe.errores).toEqual([]);
        expect(await prisma.activo.count()).toBe(26);
      },
      LENTO,
    );
  });

  describe('mejorar códigos de respaldo', () => {
    beforeAll(vaciarActivos, LENTO);
    const SIN_ETIQUETA = { codigoInstitucional: { ...REGLA, etiqueta: '' } };

    it(
      'importación sin etiqueta → todo con código de respaldo; después se mejora sin duplicar ni perder el vínculo',
      async () => {
        await motor(INVENTARIO(), SIN_ETIQUETA).ejecutar();
        const antes = await prisma.activo.findMany({ orderBy: { id: 'asc' } });
        expect(antes.every((a) => a.codigo.startsWith('GLPI-') && a.codigoInstitucional === null)).toBe(true);

        // Simulación de la mejora: informa, no escribe.
        const simulacion = await motor(INVENTARIO(), { mejorarCodigos: true, dryRun: true }).ejecutar();
        expect(simulacion.elementos.filter((e) => e.diferencias.codigo)).toHaveLength(12);
        expect(await prisma.activo.findMany({ orderBy: { id: 'asc' } })).toEqual(antes);

        const informe = await motor(INVENTARIO(), { mejorarCodigos: true }).ejecutar();
        expect(informe.errores).toEqual([]);
        expect(informe.totales.Computer).toMatchObject({ CREAR: 0, ERROR: 0 });

        const despues = await prisma.activo.findMany({ orderBy: { id: 'asc' } });
        expect(despues).toHaveLength(26);
        // Mismos activos (mismo id y misma referencia), con el código definitivo.
        expect(despues.map((a) => [a.id, a.origenGlpi])).toEqual(antes.map((a) => [a.id, a.origenGlpi]));
        const codigos = Object.fromEntries(
          despues
            .filter((a) => a.origenGlpi!.startsWith('Computer'))
            .map((a) => [Number(a.origenGlpi!.split('#')[1]), a.codigo]),
        );
        expect(codigos).toEqual(CODIGOS_ESPERADOS);

        // El cambio de código queda en el historial, firmado por GLPI.
        const pc2 = despues.find((a) => a.origenGlpi === 'Computer #2')!;
        const entrada = await prisma.bitacoraHistorial.findFirstOrThrow({
          where: { activoId: pc2.id, accion: 'ACTUALIZAR' },
        });
        expect(entrada.responsable).toBe('GLPI');
        expect(JSON.parse(entrada.detalle)).toMatchObject({
          codigo: { antes: 'GLPI-PC-2', despues: '7-1-22-69' },
          codigoInstitucional: { antes: null, despues: '7-1-22-69' },
        });

        // Idempotente.
        const otra = await motor(INVENTARIO(), { mejorarCodigos: true }).ejecutar();
        expect(otra.totales.Computer).toMatchObject({ ACTUALIZAR: 0, SIN_CAMBIOS: 25 });
      },
      LENTO,
    );
  });
});
