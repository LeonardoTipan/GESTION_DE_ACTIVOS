import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Cambios } from './cambios.js';
import type { BitacoraDto, MovimientoInventarioDto, QueryMovimientosDto } from './dto/bitacora.dto.js';
import { periodoBitacora, rangoAnio } from '../../common/bitacora/periodos.js';
import { activoBreve, SELECT_ACTIVO } from '../../common/dto/registro.dto.js';

export const ACCIONES_BITACORA = [
  'CREAR',
  'ACTUALIZAR',
  'DAR_DE_BAJA',
  // Los registra la sincronización con GLPI (papelera, ausencia o regreso).
  'INACTIVAR',
  'REACTIVAR',
] as const;
export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

/**
 * Responsable con el que la sincronización con GLPI firma sus movimientos (RESPONSABLE_GLPI en
 * glpi-sync/plan.ts; una prueba comprueba que coinciden). Distingue el origen sin acoplar los módulos.
 */
export const RESPONSABLE_SINCRONIZACION = 'GLPI';

/**
 * Historial de cambios de los activos. Lo escribe SOLO la API, dentro de la
 * misma transacción que el cambio: nunca hay un cambio sin su registro.
 */
@Injectable()
export class BitacoraService {
  constructor(private readonly prisma: PrismaService) {}

  /** Debe llamarse con el cliente de la transacción en curso (tx). */
  async registrar(
    tx: Prisma.TransactionClient,
    entrada: {
      activoId: number;
      accion: AccionBitacora;
      responsable: string;
      cambios: Cambios;
    },
  ): Promise<void> {
    await tx.bitacoraHistorial.create({
      data: {
        activoId: entrada.activoId,
        accion: entrada.accion,
        responsable: entrada.responsable,
        fecha: new Date(),
        detalle: JSON.stringify(entrada.cambios),
      },
    });
  }

  /**
   * Bitácora de movimientos de TODO el inventario (consulta, no se modifica nada): altas,
   * modificaciones, bajas e inactivaciones del período, con su origen (manual o GLPI).
   */
  async movimientos(q: QueryMovimientosDto): Promise<Paginated<MovimientoInventarioDto>> {
    const { desde, hasta } = q.mes ? periodoBitacora(q.anio, 'MENSUAL', q.mes) : rangoAnio(q.anio);
    const where: Prisma.BitacoraHistorialWhereInput = {
      fecha: { gte: desde, lt: hasta },
      ...(q.accion ? { accion: q.accion } : {}),
      ...(q.origen === 'GLPI' ? { responsable: RESPONSABLE_SINCRONIZACION } : q.origen === 'MANUAL' ? { responsable: { not: RESPONSABLE_SINCRONIZACION } } : {}),
      ...(q.q || q.categoriaId
        ? { activo: { ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}), ...(q.q ? { OR: [{ codigo: { contains: q.q } }, { nombre: { contains: q.q } }] } : {}) } }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.bitacoraHistorial.count({ where }),
      this.prisma.bitacoraHistorial.findMany({
        where,
        include: { activo: SELECT_ACTIVO },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(
      filas.map(({ activo, ...fila }) => {
        const detalle = JSON.parse(fila.detalle) as Cambios;
        const motivo = detalle.motivoInactivo?.despues;
        return {
          ...fila,
          accion: fila.accion as AccionBitacora,
          detalle,
          activo: activoBreve(activo),
          origen: fila.responsable === RESPONSABLE_SINCRONIZACION ? ('GLPI' as const) : ('MANUAL' as const),
          motivo: typeof motivo === 'string' && motivo ? motivo : null,
        };
      }),
      total,
      q,
    );
  }

  /** Historial de un activo, del más reciente al más antiguo. */
  async listarPorActivo(
    activoId: number,
    paginacion: PaginationQueryDto,
  ): Promise<Paginated<BitacoraDto>> {
    const where = { activoId };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.bitacoraHistorial.count({ where }),
      this.prisma.bitacoraHistorial.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(paginacion),
        take: paginacion.limit,
      }),
    ]);
    const data = filas.map((fila) => ({
      ...fila,
      accion: fila.accion as AccionBitacora,
      detalle: JSON.parse(fila.detalle) as Cambios,
    }));
    return paginate(data, total, paginacion);
  }
}
