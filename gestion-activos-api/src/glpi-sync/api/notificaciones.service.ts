import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Notificacion } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  NotificacionDto,
  QueryNotificacionesDto,
} from './dto/notificacion.dto.js';

const aDto = (fila: Notificacion): NotificacionDto => ({
  ...fila,
  detalle: JSON.parse(fila.detalle) as Record<string, unknown>,
});

/**
 * Avisos de lo que cambió al sincronizar con GLPI. Los crea solo la
 * sincronización; desde la aplicación se consultan y se marcan como leídos.
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryNotificacionesDto): Promise<Paginated<NotificacionDto>> {
    const where = query.soloNoLeidas ? { leida: false } : {};
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async noLeidas(): Promise<number> {
    return this.prisma.notificacion.count({ where: { leida: false } });
  }

  async marcarLeida(id: number): Promise<NotificacionDto> {
    const actual = await this.prisma.notificacion.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException(`La notificación ${id} no existe.`);
    }
    return aDto(
      actual.leida
        ? actual
        : await this.prisma.notificacion.update({
            where: { id },
            data: { leida: true },
          }),
    );
  }

  async marcarTodasLeidas(): Promise<void> {
    await this.prisma.notificacion.updateMany({
      where: { leida: false },
      data: { leida: true },
    });
  }
}
