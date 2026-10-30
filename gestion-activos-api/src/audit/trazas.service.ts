import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TrazaDto } from './dto/traza.dto.js';

/** Registros que se versionan y se anulan en lugar de borrarse. */
export const ENTIDADES = {
  PLAN_RESPALDO: { modelo: 'planRespaldo', nombre: 'El plan de respaldo' },
  EJECUCION_RESPALDO: { modelo: 'ejecucionRespaldo', nombre: 'La ejecución de respaldo' },
  RESTAURACION: { modelo: 'restauracion', nombre: 'La restauración' },
  MANTENIMIENTO: { modelo: 'mantenimiento', nombre: 'El mantenimiento' },
  VULNERABILIDAD: { modelo: 'vulnerabilidad', nombre: 'La vulnerabilidad' },
  RENOVACION: { modelo: 'renovacion', nombre: 'La renovación' },
  PERIODO_ENDPOINT: { modelo: 'periodoEndpoint', nombre: 'El período de protección de endpoints' },
  EVALUACION_SISTEMA: { modelo: 'evaluacionSistema', nombre: 'La evaluación del sistema' },
  PLAN_MANTENIMIENTO: { modelo: 'planMantenimiento', nombre: 'El plan de mantenimiento' },
} as const;
export type EntidadVersionada = keyof typeof ENTIDADES;
/**
 * Catálogos (Catálogos > Categorías y Criticidades): no tienen versión ni anulación lógica
 * (se editan y, si nadie los usa, se eliminan), pero cada alta, cambio y eliminación queda
 * en la MISMA traza común (registro_cambio) con usuario, fecha, valor anterior y nuevo.
 */
export const ENTIDADES_CATALOGO = ['CATEGORIA', 'CRITICIDAD'] as const;
export type EntidadCatalogo = (typeof ENTIDADES_CATALOGO)[number];
export type Entidad = EntidadVersionada | EntidadCatalogo;
export const NOMBRES_ENTIDAD = [...(Object.keys(ENTIDADES) as EntidadVersionada[]), ...ENTIDADES_CATALOGO] as Entidad[];

/** REGISTRAR: alta del registro (quién lo creó y con qué valores). ELIMINAR: borrado de un catálogo sin uso. */
export type AccionTraza = 'REGISTRAR' | 'MODIFICAR' | 'ANULAR' | 'REVERSAR' | 'ELIMINAR';

/** Un campo que cambió: valor anterior y nuevo. */
export interface CambioCampo {
  campo: string;
  antes: unknown;
  despues: unknown;
}

/** Campo especial con el que se anotan la anulación y la reversión. */
export const CAMPO_ESTADO_REGISTRO = '__estado_registro';

const normalizar = (valor: unknown): unknown =>
  valor instanceof Date ? valor.toISOString() : (valor ?? null);

/** Solo los campos enviados que realmente cambian. Función pura. */
export function diferencias(actual: object, nuevos: object): CambioCampo[] {
  const antes = actual as Record<string, unknown>;
  return Object.entries(nuevos)
    .filter(([, valor]) => valor !== undefined)
    .map(([campo, valor]) => ({
      campo,
      antes: normalizar(antes[campo]),
      despues: normalizar(valor),
    }))
    .filter(({ antes: a, despues: d }) => a !== d);
}

/** Lo mínimo que comparten los registros versionados. */
interface Versionado {
  id: number;
  version: number;
  anuladoEn: Date | null;
}

/**
 * Acceso uniforme a las tablas versionadas (todas tienen version y anulación).
 * Se usa el cliente de la transacción para que el cambio y su traza vayan juntos.
 */
interface Delegado {
  findUnique(args: { where: { id: number } }): Promise<Versionado | null>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * Versionado, anulación y reversión de registros, con su traza. Nada se borra:
 * cada modificación sube la versión y guarda qué cambió, quién, cuándo y por
 * qué; anular excluye el registro de los indicadores pero lo conserva.
 */
@Injectable()
export class TrazasService {
  constructor(private readonly prisma: PrismaService) {}

  private delegado(tx: Prisma.TransactionClient, entidad: EntidadVersionada): Delegado {
    return (tx as unknown as Record<string, Delegado>)[ENTIDADES[entidad].modelo];
  }

  private async cargar(
    tx: Prisma.TransactionClient,
    entidad: EntidadVersionada,
    id: number,
  ): Promise<Versionado> {
    const actual = await this.delegado(tx, entidad).findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`${ENTIDADES[entidad].nombre} ${id} no existe.`);
    }
    return actual;
  }

  /**
   * Modifica un registro vigente: exige motivo, sube la versión y guarda la
   * versión anterior. `condicion` añade requisitos al registro (p. ej. una fase).
   * `ademas` escribe algo más (p. ej. un aviso) en la MISMA transacción.
   */
  async modificar(
    entidad: EntidadVersionada,
    id: number,
    datos: Record<string, unknown>,
    motivo: string,
    responsable: string,
    condicion: Record<string, unknown> = {},
    ademas?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await this.cargar(tx, entidad, id);
      if (actual.anuladoEn) {
        throw new ConflictException(
          `${ENTIDADES[entidad].nombre} ${id} está anulado: reviértelo antes de modificarlo.`,
        );
      }
      const cambios = diferencias(actual, datos);
      if (cambios.length === 0) {
        throw new BadRequestException('No hay cambios que guardar.');
      }
      // Condicional sobre la versión: si otra persona lo modificó entretanto, 409.
      const { count } = await this.delegado(tx, entidad).updateMany({
        where: { id, version: actual.version, anuladoEn: null, ...condicion },
        data: { ...datos, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new ConflictException(
          `${ENTIDADES[entidad].nombre} ${id} cambió mientras se editaba; vuelve a consultarlo.`,
        );
      }
      await this.registrar(tx, {
        entidad,
        registroId: id,
        version: actual.version,
        accion: 'MODIFICAR',
        motivo,
        cambios,
        responsable,
      });
      if (ademas) await ademas(tx);
    });
  }

  /** Eliminación lógica: el registro se conserva y deja de contar en los indicadores. */
  async anular(
    entidad: EntidadVersionada,
    id: number,
    motivo: string,
    responsable: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await this.cargar(tx, entidad, id);
      if (actual.anuladoEn) {
        throw new ConflictException(`${ENTIDADES[entidad].nombre} ${id} ya está anulado.`);
      }
      const { count } = await this.delegado(tx, entidad).updateMany({
        where: { id, anuladoEn: null },
        data: { anuladoEn: new Date(), anuladoPor: responsable, motivoAnulacion: motivo },
      });
      if (count === 0) {
        throw new ConflictException(`${ENTIDADES[entidad].nombre} ${id} ya está anulado.`);
      }
      await this.registrar(tx, {
        entidad,
        registroId: id,
        version: actual.version,
        accion: 'ANULAR',
        motivo,
        cambios: [{ campo: CAMPO_ESTADO_REGISTRO, antes: 'Vigente', despues: 'Anulado' }],
        responsable,
      });
    });
  }

  /** Deshace una anulación: el registro vuelve a contar. La anulación queda en la traza. */
  async reversar(
    entidad: EntidadVersionada,
    id: number,
    motivo: string,
    responsable: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await this.cargar(tx, entidad, id);
      if (!actual.anuladoEn) {
        throw new ConflictException(`${ENTIDADES[entidad].nombre} ${id} no está anulado.`);
      }
      const { count } = await this.delegado(tx, entidad).updateMany({
        where: { id, anuladoEn: { not: null } },
        data: { anuladoEn: null, anuladoPor: null, motivoAnulacion: null },
      });
      if (count === 0) {
        throw new ConflictException(`${ENTIDADES[entidad].nombre} ${id} no está anulado.`);
      }
      await this.registrar(tx, {
        entidad,
        registroId: id,
        version: actual.version,
        accion: 'REVERSAR',
        motivo,
        cambios: [{ campo: CAMPO_ESTADO_REGISTRO, antes: 'Anulado', despues: 'Vigente' }],
        responsable,
      });
    });
  }

  /**
   * Alta de un registro: guarda quién lo creó y sus valores iniciales, dentro de la
   * transacción `tx` en la que se crea (si falla la traza, no queda el registro).
   */
  async registrarAlta(
    tx: Prisma.TransactionClient,
    entidad: EntidadVersionada,
    id: number,
    valores: Record<string, unknown>,
    motivo: string,
    responsable: string,
  ): Promise<void> {
    const cambios = Object.entries(valores)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([campo, despues]) => ({ campo, antes: null, despues: despues instanceof Date ? despues.toISOString() : despues }));
    await this.registrar(tx, { entidad, registroId: id, version: 0, accion: 'REGISTRAR', motivo, cambios: cambios as CambioCampo[], responsable });
  }

  /**
   * Traza de un catálogo (categoría o criticidad) dentro de la transacción del cambio. En una
   * modificación solo se guardan los campos que cambian; sin cambios, no se escribe nada.
   */
  async registrarCatalogo(
    tx: Prisma.TransactionClient,
    entidad: EntidadCatalogo,
    id: number,
    accion: 'REGISTRAR' | 'MODIFICAR' | 'ELIMINAR',
    antes: object,
    despues: object,
    responsable: string,
  ): Promise<void> {
    const cambios =
      accion === 'MODIFICAR'
        ? diferencias(antes, despues)
        : Object.entries(accion === 'REGISTRAR' ? despues : antes)
            .filter(([campo, v]) => campo !== 'id' && v !== undefined && v !== null && v !== '')
            .map(([campo, v]) => ({
              campo,
              antes: accion === 'REGISTRAR' ? null : normalizar(v),
              despues: accion === 'REGISTRAR' ? normalizar(v) : null,
            }));
    if (!cambios.length) return;
    const motivo = { REGISTRAR: 'Alta en Catálogos.', MODIFICAR: 'Modificación en Catálogos.', ELIMINAR: 'Eliminación en Catálogos (sin activos asignados).' }[accion];
    await this.registrar(tx, { entidad, registroId: id, version: 0, accion, motivo, cambios, responsable });
  }

  async listar(entidad: Entidad, registroId: number): Promise<TrazaDto[]> {
    const filas = await this.prisma.registroCambio.findMany({
      where: { entidad, registroId },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
    return filas.map((fila) => ({
      ...fila,
      entidad: fila.entidad as Entidad,
      accion: fila.accion as AccionTraza,
      cambios: JSON.parse(fila.cambios) as CambioCampo[],
    }));
  }

  private async registrar(
    tx: Prisma.TransactionClient,
    traza: {
      entidad: Entidad;
      registroId: number;
      version: number;
      accion: AccionTraza;
      motivo: string;
      cambios: CambioCampo[];
      responsable: string;
    },
  ): Promise<void> {
    await tx.registroCambio.create({
      data: { ...traza, cambios: JSON.stringify(traza.cambios) },
    });
  }
}
