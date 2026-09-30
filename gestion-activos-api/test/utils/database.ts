import type { PrismaService } from '../../src/prisma/prisma.service.js';

/**
 * Vacía todas las tablas. Antes de borrar, pregunta a MySQL a qué base está
 * conectado y se niega si no es una base de pruebas (segunda barrera de seguridad).
 */
export async function limpiarBaseDeDatos(prisma: PrismaService): Promise<void> {
  const [{ db }] = await prisma.$queryRawUnsafe<{ db: string }[]>(
    'SELECT DATABASE() AS db',
  );
  if (!db.endsWith('_test')) {
    throw new Error(`Me niego a vaciar "${db}": no es una base de pruebas.`);
  }
  // Orden: primero las tablas hijas, luego las que referencian.
  await prisma.$transaction([
    prisma.bitacoraHistorial.deleteMany(),
    prisma.respaldo.deleteMany(),
    prisma.mantenimiento.deleteMany(),
    prisma.vulnerabilidad.deleteMany(),
    prisma.activo.deleteMany(),
    prisma.categoria.deleteMany(),
    prisma.criticidad.deleteMany(),
  ]);
}
