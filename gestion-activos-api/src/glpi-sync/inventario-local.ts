import type { PrismaClient } from '../generated/prisma/client.js';
import type { BitacoraService } from '../inventory/bitacora/bitacora.service.js';
import {
  calcularCambios,
  cambiosDeCreacion,
} from '../inventory/bitacora/cambios.js';
import type { ActivoGlpi } from './mapeo.js';
import { RESPONSABLE_GLPI, type ActivoLocal, type Plan } from './plan.js';

export interface Catalogos {
  /** nombre de categoría → id */
  categorias: Map<string, number>;
  /** nivel de criticidad → id */
  criticidades: Map<string, number>;
}

/** Clave de comparación de códigos (MySQL ya los compara sin mayúsculas). */
export const claveCodigo = (codigo: string): string =>
  codigo.trim().toLowerCase();

/** Otro proceso creó a la vez el mismo activo: la base lo impidió. */
export class ActivoDuplicadoError extends Error {
  constructor(referencia: string) {
    super(
      `Otra sincronización registró ${referencia} al mismo tiempo: la base de datos impidió el duplicado. Se reconocerá en la próxima ejecución.`,
    );
    this.name = 'ActivoDuplicadoError';
  }
}

/**
 * Lo único que el motor necesita de nuestra base. Tenerlo como interfaz
 * permite probar toda la sincronización sin MySQL.
 */
export interface InventarioLocal {
  catalogos(): Promise<Catalogos>;
  /**
   * Registros que apuntan a un activo que no existe (por tabla). Con huérfanos,
   * un alta podría reutilizar su id y heredarlos: no se debe escribir.
   */
  huerfanos(): Promise<{ tabla: string; cantidad: number }[]>;
  /**
   * Activos (incluidas las bajas) vinculados a alguna de esas referencias de
   * GLPI, o cuyo código operativo, n.º de inventario o código institucional
   * coincida con alguno de esos valores.
   */
  buscar(referencias: string[], valores: string[]): Promise<ActivoLocal[]>;
  /** Alta vinculada a GLPI + entrada de historial firmada por GLPI. Devuelve el id nuevo. */
  crear(
    glpi: ActivoGlpi,
    codigo: string,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number>;
  /** Aplica un plan ENLAZAR o ACTUALIZAR + entrada de historial firmada por GLPI. */
  aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void>;
}

/** Violación de una restricción UNIQUE de MySQL (código de Prisma). */
const esDuplicado = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === 'P2002';

export class InventarioPrisma implements InventarioLocal {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bitacora: BitacoraService,
  ) {}

  async catalogos(): Promise<Catalogos> {
    const [categorias, criticidades] = await Promise.all([
      this.prisma.categoria.findMany({ select: { id: true, nombre: true } }),
      this.prisma.criticidad.findMany({ select: { id: true, nivel: true } }),
    ]);
    return {
      categorias: new Map(categorias.map((c) => [c.nombre, c.id])),
      criticidades: new Map(criticidades.map((c) => [c.nivel, c.id])),
    };
  }

  async huerfanos(): Promise<{ tabla: string; cantidad: number }[]> {
    const encontrados: { tabla: string; cantidad: number }[] = [];
    for (const tabla of [
      'respaldo',
      'mantenimiento',
      'vulnerabilidad',
      'bitacora_historial',
    ]) {
      const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM \`${tabla}\` t LEFT JOIN activo a ON a.id = t.activoId WHERE a.id IS NULL`,
      );
      if (Number(n) > 0) encontrados.push({ tabla, cantidad: Number(n) });
    }
    return encontrados;
  }

  buscar(referencias: string[], valores: string[]): Promise<ActivoLocal[]> {
    return this.prisma.activo.findMany({
      where: {
        OR: [
          { origenGlpi: { in: referencias } },
          { codigo: { in: valores } },
          { numeroInventario: { in: valores } },
          { codigoInstitucional: { in: valores } },
        ],
      },
      orderBy: { id: 'asc' },
    });
  }

  async crear(
    glpi: ActivoGlpi,
    codigo: string,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number> {
    const data = { codigo, origenGlpi: glpi.referencia, ...glpi.alCrear, ...ids };
    try {
      // Alta e historial en la misma transacción: o los dos, o ninguno.
      return await this.prisma.$transaction(async (tx) => {
        const activo = await tx.activo.create({ data });
        await this.bitacora.registrar(tx, {
          activoId: activo.id,
          accion: 'CREAR',
          responsable: RESPONSABLE_GLPI,
          cambios: cambiosDeCreacion(data),
        });
        return activo.id;
      });
    } catch (error) {
      // Las restricciones UNIQUE (origenGlpi y codigo) son la última barrera
      // ante dos sincronizaciones simultáneas.
      if (esDuplicado(error)) throw new ActivoDuplicadoError(glpi.referencia);
      throw error;
    }
  }

  async aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void> {
    // Al vincular, el activo queda asociado a su elemento de GLPI. El código
    // operativo solo cambia si el plan lo pide expresamente (nuevoCodigo).
    const data = {
      ...glpi.datos,
      ...(plan.accion === 'ENLAZAR' ? { origenGlpi: glpi.referencia } : {}),
      // Solo con la política explícita de mejorar códigos de respaldo.
      ...(plan.nuevoCodigo ? { codigo: plan.nuevoCodigo } : {}),
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        // Solo si sigue vigente y, al vincular, si nadie lo vinculó entretanto.
        const { count } = await tx.activo.updateMany({
          where: {
            id: local.id,
            deletedAt: null,
            ...(plan.accion === 'ENLAZAR' ? { origenGlpi: null } : {}),
          },
          data,
        });
        if (count === 0) {
          throw new Error(
            `El activo ${local.codigo} cambió mientras se sincronizaba (dado de baja o ya vinculado); no se modificó.`,
          );
        }
        await this.bitacora.registrar(tx, {
          activoId: local.id,
          accion: 'ACTUALIZAR',
          responsable: RESPONSABLE_GLPI,
          cambios: calcularCambios(local, data),
        });
      });
    } catch (error) {
      if (esDuplicado(error)) throw new ActivoDuplicadoError(glpi.referencia);
      throw error;
    }
  }
}
