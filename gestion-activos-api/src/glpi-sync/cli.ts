/**
 * Ejecución única de la sincronización con GLPI.
 *
 *   npm run glpi:simular           simulación con 10 elementos de cada tipo
 *   npm run glpi:sync -- --simular simulación completa
 *   npm run glpi:sync -- --aplicar escribe en la base
 *
 * Opciones: --simular | --aplicar · --max=N (tope por tipo) · --bloque=N
 *           --mejorar-codigos (cambia códigos de respaldo por el institucional)
 * Sin --simular ni --aplicar manda GLPI_DRY_RUN (por defecto, simulación).
 */
import 'dotenv/config';
import { componer } from './componer.js';
import { leerConfig } from './config.js';

function entero(args: string[], nombre: string): number | undefined {
  const crudo = args.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
  if (crudo === undefined) return undefined;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--${nombre} debe ser un entero positivo (recibido "${crudo}")`);
  }
  return n;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--simular') && args.includes('--aplicar')) {
    throw new Error('Elige --simular o --aplicar, no los dos.');
  }
  const config = leerConfig(process.env);
  if (args.includes('--simular')) config.dryRun = true;
  if (args.includes('--aplicar')) config.dryRun = false;
  if (args.includes('--mejorar-codigos')) config.mejorarCodigos = true;
  config.maxPorTipo = entero(args, 'max') ?? config.maxPorTipo;
  config.tamanoBloque = entero(args, 'bloque') ?? config.tamanoBloque;

  const motor = componer(config);
  try {
    const informe = await motor.ejecutar();
    const conError = informe.elementos.some((e) => e.resultado === 'ERROR');
    return informe.errores.length > 0 || conError ? 1 : 0;
  } finally {
    await motor.cerrar();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
