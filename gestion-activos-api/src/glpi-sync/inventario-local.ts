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

/** Activos locales relevantes para un bloque de elementos de GLPI. */
export interface Encontrados {
  /** Por referencia de GLPI ("Computer #12"): los ya enlazados. */
  porReferencia: Map<string, ActivoLocal>;
  /** Por código, indexados con claveCodigo() (incluye las bajas). */
  porCodigo: Map<string, ActivoLocal>;
}

/**
 * Lo único que el motor necesita de nuestra base. Tenerlo como interfaz
 * permite probar toda la sincronización sin MySQL.
 */
export interface InventarioLocal {
  catalogos(): Promise<Catalogos>;
  buscar(referencias: string[], codigos: string[]): Promise<Encontrados>;
  /** Alta enlazada a GLPI + entrada de historial firmada por GLPI. Devuelve el id nuevo. */
  crear(
    glpi: ActivoGlpi,
    codigo: string,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number>;
  /** Aplica un plan ENLAZAR o ACTUALIZAR + entrada de historial firmada por GLPI. */
  aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void>;
}

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

  async buscar(referencias: string[], codigos: string[]): Promise<Encontrados> {
    const activos = await this.prisma.activo.findMany({
      where: {
        OR: [{ origenGlpi: { in: referencias } }, { codigo: { in: codigos } }],
      },
    });
    const porReferencia = new Map<string, ActivoLocal>();
    const porCodigo = new Map<string, ActivoLocal>();
    for (const activo of activos) {
      if (activo.origenGlpi) porReferencia.set(activo.origenGlpi, activo);
      porCodigo.set(claveCodigo(activo.codigo), activo);
    }
    return { porReferencia, porCodigo };
  }

  async crear(
    glpi: ActivoGlpi,
    codigo: string,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number> {
    const data = { codigo, origenGlpi: glpi.referencia, ...glpi.alCrear, ...ids };
    return this.prisma.$transaction(async (tx) => {
      const activo = await tx.activo.create({ data });
      await this.bitacora.registrar(tx, {
        activoId: activo.id,
        accion: 'CREAR',
        responsable: RESPONSABLE_GLPI,
        cambios: cambiosDeCreacion(data),
      });
      return activo.id;
    });
  }

  async aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void> {
    // Al enlazar, el activo queda asociado a su elemento de GLPI.
    const data =
      plan.accion === 'ENLAZAR'
        ? { ...glpi.datos, origenGlpi: glpi.referencia }
        : glpi.datos;
    await this.prisma.$transaction(async (tx) => {
      await tx.activo.update({ where: { id: local.id }, data });
      await this.bitacora.registrar(tx, {
        activoId: local.id,
        accion: 'ACTUALIZAR',
        responsable: RESPONSABLE_GLPI,
        cambios: calcularCambios(local, data),
      });
    });
  }
}
