/**
 * Worker en segundo plano: sincroniza con GLPI según GLPI_SYNC_CRON.
 * Proceso propio (contenedor glpi-sync): no forma parte de la API.
 *
 *   npm run glpi:worker
 *
 * Con GLPI_DRY_RUN sin definir o distinto de "false", cada ejecución es una
 * simulación: informa pero no escribe.
 *
 * Cada ejecución es incremental (solo lo modificado en GLPI) y, cada
 * GLPI_RECONCILIACION_HORAS, completa. Si el botón manual de la aplicación
 * está sincronizando en ese momento, el bloqueo de la base hace que esta
 * ejecución se salte.
 */
import 'dotenv/config';
import cron from 'node-cron';
import { componer } from './componer.js';
import { leerConfig } from './config.js';

const config = leerConfig(process.env);
config.origen = 'AUTOMATICA';
if (!cron.validate(config.cron)) {
  console.error(`GLPI_SYNC_CRON no es una expresión cron válida: "${config.cron}"`);
  process.exit(1);
}

const motor = componer(config);

const tarea = cron.schedule(
  config.cron,
  async () => {
    console.log(`[glpi-sync] Inicio de la sincronización programada`);
    try {
      await motor.ejecutar();
    } catch (error) {
      // Nunca se deja caer el worker: la siguiente ejecución lo reintenta.
      console.error('[glpi-sync] La sincronización falló:', error);
    }
  },
  // Si una ejecución se alarga, la siguiente se salta en vez de solaparse.
  { name: 'glpi-sync', noOverlap: true },
);

console.log(
  `[glpi-sync] Worker activo · cron "${config.cron}" · ` +
    `${config.dryRun ? 'SIMULACIÓN (no escribe)' : 'APLICA cambios'} · ` +
    `tipos: ${config.itemtypes.join(', ')} · próxima: ${tarea.getNextRun()?.toISOString() ?? '—'}`,
);

async function apagar(senal: string): Promise<void> {
  console.log(`[glpi-sync] ${senal}: deteniendo el worker…`);
  await tarea.stop();
  await motor.cerrar();
  process.exit(0);
}
process.on('SIGTERM', () => void apagar('SIGTERM'));
process.on('SIGINT', () => void apagar('SIGINT'));
