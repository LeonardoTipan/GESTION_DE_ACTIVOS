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
import type { BitacoraDto } from './dto/bitacora.dto.js';

export const ACCIONES_BITACORA = [
  'CREAR',
  'ACTUALIZAR',
  'DAR_DE_BAJA',
] as const;
export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

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
