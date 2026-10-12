import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { BitacoraService } from '../inventory/bitacora/bitacora.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GlpiSyncConfig } from './config.js';
import { fetchSinVerificarTls } from './fetch-sin-verificar.js';
import { GlpiClient } from './glpi-client.js';
import {
  formatearInforme,
  guardarInforme,
  type Informe,
} from './informe.js';
import { InventarioPrisma } from './inventario-local.js';
import { Sincronizador } from './sincronizador.js';

/**
 * Monta el motor con sus dependencias reales (GLPI + MySQL). Es un proceso
 * aparte de la API: no importa AppModule ni levanta el servidor HTTP.
 */
export function componer(config: GlpiSyncConfig) {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(config.databaseUrl),
  });
  // Se reutiliza el servicio de bitácora de la API: mismo formato de historial.
  // registrar() solo usa el cliente de la transacción que recibe.
  const bitacora = new BitacoraService(prisma as PrismaService);
  const glpi = new GlpiClient({
    apiUrl: config.apiUrl,
    apiVersion: config.apiVersion,
    credenciales: config.credenciales,
    timeoutMs: config.timeoutMs,
    // ⚠️ Solo desarrollo: ver fetch-sin-verificar.ts.
    fetch: config.ignorarSsl ? fetchSinVerificarTls : undefined,
  });
  const sincronizador = new Sincronizador(
    config,
    glpi,
    new InventarioPrisma(prisma, bitacora),
  );

  return {
    /** Ejecuta una sincronización, la muestra en consola y guarda el informe JSON. */
    async ejecutar(): Promise<Informe> {
      if (config.ignorarSsl) {
        console.warn(
          [
            '',
            '⚠️  GLPI_IGNORE_SSL=true: NO se valida el certificado HTTPS de GLPI.',
            '    Solo para desarrollo: las credenciales podrían ser interceptadas.',
            '    Quita esta variable en cuanto se renueve el certificado.',
            '',
          ].join('\n'),
        );
      }
      const informe = await sincronizador.ejecutar();
      console.log(formatearInforme(informe));
      try {
        const ruta = await guardarInforme(informe, config.dirInformes);
        console.log(`Informe de auditoría guardado en ${ruta}`);
      } catch (error) {
        console.error(
          `No se pudo guardar el informe: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return informe;
    },
    cerrar: () => prisma.$disconnect(),
  };
}
