import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente de Prisma compartido por toda la API.
 * Prisma 7 se conecta a MySQL a través del driver adapter de MariaDB (protocolo compatible).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaMariaDb(config.getOrThrow<string>('DATABASE_URL')),
    });
  }

  /** Conecta al arrancar: si la base no responde, la API falla al inicio y no en la primera petición. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
