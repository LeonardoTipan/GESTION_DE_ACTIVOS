import { Injectable } from '@nestjs/common';
import type { Prisma, TipoNotificacion } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Cliente de Prisma o el de una transacción en curso. */
type Cliente = Prisma.TransactionClient | PrismaService;

/**
 * Avisos de eventos importantes de los módulos (respaldo fallido,
 * vulnerabilidad crítica…). Se guardan en la misma bandeja que los avisos de
 * GLPI y se ven en la campana de la aplicación. Es el único canal que existe:
 * no se envían correos ni mensajes externos.
 */
@Injectable()
export class AvisosService {
  constructor(private readonly prisma: PrismaService) {}

  async avisar(
    aviso: {
      tipo: TipoNotificacion;
      titulo: string;
      mensaje: string;
      activoId?: number;
    },
    cliente: Cliente = this.prisma,
  ): Promise<void> {
    await cliente.notificacion.create({
      data: {
        tipo: aviso.tipo,
        titulo: aviso.titulo.length <= 191 ? aviso.titulo : `${aviso.titulo.slice(0, 190)}…`,
        detalle: JSON.stringify({ mensaje: aviso.mensaje }),
        activoId: aviso.activoId,
      },
    });
  }
}
