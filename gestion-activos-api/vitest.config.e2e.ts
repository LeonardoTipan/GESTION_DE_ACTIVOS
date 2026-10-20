import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Los tests e2e escriben y BORRAN datos: solo pueden usar una base de pruebas.
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl?.split('?')[0].endsWith('_test')) {
  throw new Error(
    'DATABASE_URL_TEST debe apuntar a una base cuyo nombre termine en "_test".',
  );
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // La API de los tests se conecta a la base de pruebas, nunca a la de desarrollo.
    env: { DATABASE_URL: testDatabaseUrl },
    // Aplica las migraciones pendientes a la base de pruebas antes de empezar.
    globalSetup: ['./test/setup/global-setup.ts'],
    // Todos los archivos comparten la misma base: se ejecutan de uno en uno.
    fileParallelism: false,
  },
});
