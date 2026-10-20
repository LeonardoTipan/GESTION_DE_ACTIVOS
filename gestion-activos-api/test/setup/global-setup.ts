import { execSync } from 'node:child_process';

/** Antes de todos los tests e2e: deja la base de pruebas con el esquema al día. */
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
    stdio: 'ignore',
  });
}
