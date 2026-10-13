import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { BitacoraService } from '../inventory/bitacora/bitacora.service.js';
import {
  calcularCambios,
  cambiosDeCreacion,
} from '../inventory/bitacora/cambios.js';
import type { Itemtype } from './config.js';
import type { ActivoGlpi } from './mapeo.js';
import {
  notificacionDeCambio,
  type NotificacionNueva,
} from './notificaciones.js';
import {
  MOTIVO_INACTIVO,
  RESPONSABLE_GLPI,
  type ActivoLocal,
  type Plan,
  type Situacion,
} from './plan.js';

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

/** Ya hay una sincronización escribiendo: la base no admite otra a la vez. */
export class EjecucionEnCursoError extends Error {
  constructor(readonly desde: Date | null) {
    super(
      `Ya hay una sincronización en curso${desde ? ` (empezó a las ${desde.toISOString()})` : ''}: no se inicia otra.`,
    );
    this.name = 'EjecucionEnCursoError';
  }
}

export type OrigenEjecucion = 'MANUAL' | 'AUTOMATICA' | 'CONSOLA';
export type ModoEjecucion = 'COMPLETA' | 'INCREMENTAL';
export type EstadoEjecucion = 'EXITOSA' | 'CON_ERRORES' | 'FALLIDA';

/** De dónde parte la siguiente sincronización incremental. */
export interface PuntoDeControl {
  /** Instante hasta el que GLPI quedó procesado en la última ejecución sin errores. */
  puntoControl: Date;
  /** Tipos que cubrió esa ejecución. */
  tipos: string[];
  /** Inicio de la última reconciliación completa sin errores. */
  ultimaCompleta: Date | null;
}

export interface InicioEjecucion {
  origen: OrigenEjecucion;
  modo: ModoEjecucion;
  tipos: string[];
  solicitadaPor?: string;
  inicio: Date;
  /** Minutos tras los que un bloqueo se considera abandonado (proceso caído). */
  caducaMin: number;
}

export interface ContadoresEjecucion {
  leidos: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  inactivados: number;
  reactivados: number;
  omitidos: number;
  errores: number;
  porRevisar: number;
  /** Cambios que GLPI traía… */
  detectados: number;
  /** …y los que realmente se escribieron. */
  aplicados: number;
}

export interface ResultadoEjecucion {
  estado: EstadoEjecucion;
  fin: Date;
  /** Solo si no hubo errores: el nuevo punto de control. */
  puntoControl: Date | null;
  contadores: ContadoresEjecucion;
  /** Errores generales y cambios por elemento (se guarda como JSON). */
  resumen: object;
  /** Mensaje del aviso de error (si la ejecución no fue limpia). */
  aviso?: string;
}

/** Lo que acompaña a una escritura: a qué ejecución pertenece y si cambia la situación. */
export interface ExtraEscritura {
  ejecucionId?: number;
  situacion?: Situacion;
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
  /**
   * Alta vinculada a GLPI + historial firmado por GLPI + aviso. Devuelve el id
   * nuevo. Un elemento en la papelera nace ya como "No activo".
   */
  crear(
    glpi: ActivoGlpi,
    codigo: string,
    ids: { categoriaId: number; criticidadId: number },
    extra?: ExtraEscritura,
  ): Promise<number>;
  /**
   * Aplica un plan ENLAZAR o ACTUALIZAR y/o un cambio de situación (papelera)
   * + historial firmado por GLPI + aviso, todo en la misma transacción.
   */
  aplicar(
    local: ActivoLocal,
    glpi: ActivoGlpi,
    plan: Plan,
    extra?: ExtraEscritura,
  ): Promise<void>;

  // ── Sincronización incremental y reconciliación ──────────────────────────
  /** Último punto de control válido; null si nunca hubo una ejecución sin errores. */
  puntoDeControl(): Promise<PuntoDeControl | null>;
  /**
   * Registra el inicio y TOMA EL BLOQUEO. Lanza EjecucionEnCursoError si otra
   * sincronización está escribiendo. Devuelve el id de la ejecución.
   */
  iniciarEjecucion(datos: InicioEjecucion): Promise<number>;
  /** Guarda el resultado, libera el bloqueo y, si hubo errores, deja un aviso (sin repetirlo). */
  finalizarEjecucion(id: number, resultado: ResultadoEjecucion): Promise<void>;
  /** Activos vigentes (sin baja manual) vinculados a elementos de ese tipo de GLPI. */
  vinculados(itemtype: Itemtype): Promise<ActivoLocal[]>;
  /**
   * El elemento ya no existe en GLPI (confirmado por una lectura completa):
   * el activo pasa a "No activo". No borra nada: conserva ficha, historial y registros.
   */
  marcarAusente(local: ActivoLocal, ejecucionId?: number): Promise<void>;
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
    extra: ExtraEscritura = {},
  ): Promise<number> {
    const data = {
      codigo,
      origenGlpi: glpi.referencia,
      ...glpi.alCrear,
      ...ids,
      ...(glpi.enPapelera
        ? { inactivoDesde: new Date(), motivoInactivo: MOTIVO_INACTIVO.PAPELERA }
        : {}),
    };
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
        await this.notificar(
          tx,
          notificacionDeCambio({
            codigo,
            nombre: data.nombre,
            accion: 'CREAR',
            cambios: cambiosDeCreacion(data),
          }),
          activo.id,
          extra.ejecucionId,
        );
        return activo.id;
      });
    } catch (error) {
      // Las restricciones UNIQUE (origenGlpi y codigo) son la última barrera
      // ante dos sincronizaciones simultáneas.
      if (esDuplicado(error)) throw new ActivoDuplicadoError(glpi.referencia);
      throw error;
    }
  }

  async aplicar(
    local: ActivoLocal,
    glpi: ActivoGlpi,
    plan: Plan,
    extra: ExtraEscritura = {},
  ): Promise<void> {
    // Al vincular, el activo queda asociado a su elemento de GLPI. El código
    // operativo solo cambia si el plan lo pide expresamente (nuevoCodigo).
    const data = {
      ...glpi.datos,
      ...(plan.accion === 'ENLAZAR' ? { origenGlpi: glpi.referencia } : {}),
      // Solo con la política explícita de mejorar códigos de respaldo.
      ...(plan.nuevoCodigo ? { codigo: plan.nuevoCodigo } : {}),
      ...(extra.situacion === 'INACTIVAR'
        ? { inactivoDesde: new Date(), motivoInactivo: MOTIVO_INACTIVO.PAPELERA }
        : extra.situacion === 'REACTIVAR'
          ? { inactivoDesde: null, motivoInactivo: null }
          : {}),
    };
    const cambios = calcularCambios(local, data);
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
          accion: extra.situacion ?? 'ACTUALIZAR',
          responsable: RESPONSABLE_GLPI,
          cambios,
        });
        await this.notificar(
          tx,
          notificacionDeCambio({
            codigo: plan.nuevoCodigo ?? local.codigo,
            nombre: data.nombre ?? local.nombre,
            accion: plan.accion === 'ENLAZAR' ? 'ENLAZAR' : 'ACTUALIZAR',
            situacion: extra.situacion,
            motivo: MOTIVO_INACTIVO.PAPELERA,
            cambios,
          }),
          local.id,
          extra.ejecucionId,
        );
      });
    } catch (error) {
      if (esDuplicado(error)) throw new ActivoDuplicadoError(glpi.referencia);
      throw error;
    }
  }

  async marcarAusente(local: ActivoLocal, ejecucionId?: number): Promise<void> {
    const data = {
      inactivoDesde: new Date(),
      motivoInactivo: MOTIVO_INACTIVO.AUSENTE,
    };
    const cambios = calcularCambios(local, data);
    await this.prisma.$transaction(async (tx) => {
      // Solo si sigue vigente y activo: nunca se pisa una baja manual.
      const { count } = await tx.activo.updateMany({
        where: { id: local.id, deletedAt: null, inactivoDesde: null },
        data,
      });
      if (count === 0) return;
      await this.bitacora.registrar(tx, {
        activoId: local.id,
        accion: 'INACTIVAR',
        responsable: RESPONSABLE_GLPI,
        cambios,
      });
      await this.notificar(
        tx,
        notificacionDeCambio({
          codigo: local.codigo,
          nombre: local.nombre,
          accion: 'ACTUALIZAR',
          situacion: 'INACTIVAR',
          motivo: MOTIVO_INACTIVO.AUSENTE,
          cambios,
        }),
        local.id,
        ejecucionId,
      );
    });
  }

  vinculados(itemtype: Itemtype): Promise<ActivoLocal[]> {
    return this.prisma.activo.findMany({
      where: { origenGlpi: { startsWith: `${itemtype} #` }, deletedAt: null },
      orderBy: { id: 'asc' },
    });
  }

  async puntoDeControl(): Promise<PuntoDeControl | null> {
    const exitosa = { estado: 'EXITOSA', puntoControl: { not: null } } as const;
    const [ultima, completa] = await Promise.all([
      this.prisma.sincronizacion.findFirst({
        where: exitosa,
        orderBy: { id: 'desc' },
      }),
      this.prisma.sincronizacion.findFirst({
        where: { ...exitosa, modo: 'COMPLETA' },
        orderBy: { id: 'desc' },
      }),
    ]);
    if (!ultima?.puntoControl) return null;
    return {
      puntoControl: ultima.puntoControl,
      tipos: ultima.tipos.split(','),
      ultimaCompleta: completa?.inicio ?? null,
    };
  }

  async iniciarEjecucion(datos: InicioEjecucion): Promise<number> {
    for (let intento = 0; ; intento += 1) {
      try {
        const fila = await this.prisma.sincronizacion.create({
          data: {
            origen: datos.origen,
            modo: datos.modo,
            tipos: datos.tipos.join(','),
            solicitadaPor: datos.solicitadaPor,
            inicio: datos.inicio,
            // La columna es única: si ya hay una fila con true, MySQL rechaza esta.
            enCurso: true,
          },
        });
        return fila.id;
      } catch (error) {
        if (!esDuplicado(error)) throw error;
        const activa = await this.prisma.sincronizacion.findFirst({
          where: { enCurso: true },
        });
        if (intento > 0) throw new EjecucionEnCursoError(activa?.inicio ?? null);
        if (!activa) continue; // terminó justo ahora: se reintenta una vez
        const caduca = activa.inicio.getTime() + datos.caducaMin * 60_000;
        if (caduca > Date.now()) throw new EjecucionEnCursoError(activa.inicio);
        // Bloqueo abandonado (el proceso murió sin liberarlo): se cierra y se reintenta.
        await this.prisma.sincronizacion.updateMany({
          where: { id: activa.id, enCurso: true },
          data: {
            enCurso: null,
            estado: 'FALLIDA',
            fin: new Date(),
            resumen: JSON.stringify({
              errores: [
                `La ejecución no terminó (proceso interrumpido); su bloqueo caducó a los ${datos.caducaMin} minutos.`,
              ],
            }),
          },
        });
      }
    }
  }

  async finalizarEjecucion(
    id: number,
    resultado: ResultadoEjecucion,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sincronizacion.update({
        where: { id },
        data: {
          estado: resultado.estado,
          fin: resultado.fin,
          puntoControl: resultado.puntoControl,
          ...resultado.contadores,
          resumen: JSON.stringify(resultado.resumen),
          enCurso: null, // libera el bloqueo
        },
      });
      if (!resultado.aviso) return;
      const detalle = JSON.stringify({ mensaje: resultado.aviso });
      // Un fallo que se repite en cada ejecución (GLPI caído) no llena la bandeja:
      // mientras el aviso anterior siga sin leer y diga lo mismo, no se crea otro.
      const anterior = await tx.notificacion.findFirst({
        where: { tipo: 'ERROR_SINCRONIZACION' },
        orderBy: { id: 'desc' },
      });
      if (anterior && !anterior.leida && anterior.detalle === detalle) return;
      await tx.notificacion.create({
        data: {
          tipo: 'ERROR_SINCRONIZACION',
          titulo: 'La sincronización con GLPI terminó con errores',
          detalle,
          sincronizacionId: id,
        },
      });
    });
  }

  private async notificar(
    tx: Prisma.TransactionClient,
    aviso: NotificacionNueva,
    activoId: number,
    sincronizacionId?: number,
  ): Promise<void> {
    await tx.notificacion.create({
      data: {
        tipo: aviso.tipo,
        titulo: aviso.titulo,
        detalle: JSON.stringify(aviso.detalle),
        activoId,
        sincronizacionId,
      },
    });
  }
}
