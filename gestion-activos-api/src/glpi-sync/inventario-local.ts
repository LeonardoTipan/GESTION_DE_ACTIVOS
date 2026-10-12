import type { PrismaClient } from '../generated/prisma/client.js';
import type { BitacoraService } from '../inventory/bitacora/bitacora.service.js';
import { cambiosDeCreacion } from '../inventory/bitacora/cambios.js';
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

/**
 * Lo único que el motor necesita de nuestra base. Tenerlo como interfaz
 * permite probar toda la sincronización sin MySQL.
 */
export interface InventarioLocal {
  catalogos(): Promise<Catalogos>;
  /** Activos (incluidas las bajas) por código, indexados con claveCodigo(). */
  buscarPorCodigos(codigos: string[]): Promise<Map<string, ActivoLocal>>;
  /** Alta + entrada de historial firmada por GLPI. Devuelve el id nuevo. */
  crear(
    glpi: ActivoGlpi,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number>;
  /** Aplica un plan ENLAZAR o ACTUALIZAR + entrada de historial firmada por GLPI. */
  aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void>;
}

/** Referencia al elemento de GLPI que queda en el historial al crear o enlazar. */
const origen = (glpi: ActivoGlpi) => ({
  origenGlpi: { antes: null, despues: `${glpi.itemtype} #${glpi.glpiId}` },
});

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

  async buscarPorCodigos(codigos: string[]): Promise<Map<string, ActivoLocal>> {
    if (codigos.length === 0) return new Map();
    const activos = await this.prisma.activo.findMany({
      where: { codigo: { in: codigos } },
    });
    const enlazados = await this.prisma.bitacoraHistorial.findMany({
      where: {
        activoId: { in: activos.map((a) => a.id) },
        responsable: RESPONSABLE_GLPI,
      },
      select: { activoId: true },
      distinct: ['activoId'],
    });
    const conRastro = new Set(enlazados.map((e) => e.activoId));
    return new Map(
      activos.map((a) => [
        claveCodigo(a.codigo),
        { ...a, enlazadoConGlpi: conRastro.has(a.id) },
      ]),
    );
  }

  async crear(
    glpi: ActivoGlpi,
    ids: { categoriaId: number; criticidadId: number },
  ): Promise<number> {
    const data = { codigo: glpi.codigo, ...glpi.alCrear, ...ids };
    return this.prisma.$transaction(async (tx) => {
      const activo = await tx.activo.create({ data });
      await this.bitacora.registrar(tx, {
        activoId: activo.id,
        accion: 'CREAR',
        responsable: RESPONSABLE_GLPI,
        cambios: { ...cambiosDeCreacion(data), ...origen(glpi) },
      });
      return activo.id;
    });
  }

  async aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void> {
    const hayDiferencias = Object.keys(plan.diferencias).length > 0;
    await this.prisma.$transaction(async (tx) => {
      if (hayDiferencias) {
        await tx.activo.update({ where: { id: local.id }, data: glpi.datos });
      }
      // Al enlazar siempre queda constancia, aunque los datos ya coincidieran.
      await this.bitacora.registrar(tx, {
        activoId: local.id,
        accion: 'ACTUALIZAR',
        responsable: RESPONSABLE_GLPI,
        cambios: {
          ...plan.diferencias,
          ...(plan.accion === 'ENLAZAR' ? origen(glpi) : {}),
        },
      });
    });
  }
}
