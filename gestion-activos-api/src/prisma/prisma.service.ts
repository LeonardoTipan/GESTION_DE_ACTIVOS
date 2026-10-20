import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { adaptadorMySql, esErrorDeAutenticacion } from './conexion.js';

/** Intentos y pausa al arrancar, por si la API arranca antes que MySQL. */
const INTENTOS = 15;
const PAUSA_MS = 2_000;

/**
 * Cliente de Prisma compartido por toda la API.
 * Prisma 7 se conecta a MySQL a través del driver adapter de MariaDB (protocolo compatible).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({ adapter: adaptadorMySql(config.getOrThrow<string>('DATABASE_URL')) });
  }

  /**
   * Comprueba la conexión con una consulta real antes de aceptar peticiones.
   * Si MySQL aún no está disponible, reintenta durante unos 30 s; un error de
   * credenciales falla en el acto, con su causa (reintentar no lo arregla).
   */
  async onModuleInit(): Promise<void> {
    for (let intento = 1; ; intento++) {
      try {
        await this.$connect();
        await this.$queryRawUnsafe('SELECT 1');
        if (intento > 1) this.logger.log(`Conectado a MySQL al intento ${intento}.`);
        return;
      } catch (e) {
        if (esErrorDeAutenticacion(e) || intento >= INTENTOS) {
          this.logger.error(`No se pudo conectar a MySQL: ${(e as Error).message}`);
          throw e;
        }
        this.logger.warn(`MySQL aún no responde (intento ${intento}/${INTENTOS}); reintento en ${PAUSA_MS / 1000} s.`);
        await new Promise((r) => setTimeout(r, PAUSA_MS));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
