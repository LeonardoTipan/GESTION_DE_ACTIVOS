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
    prisma.registroCambio.deleteMany(),
    prisma.restauracion.deleteMany(),
    prisma.ejecucionRespaldo.deleteMany(),
    prisma.planRespaldo.deleteMany(),
    prisma.verificacionMantenimiento.deleteMany(),
    prisma.notificacion.deleteMany(),
    prisma.sincronizacion.deleteMany(),
    prisma.bitacoraHistorial.deleteMany(),
    prisma.respaldo.deleteMany(),
    prisma.mantenimiento.deleteMany(),
    prisma.planMantenimiento.deleteMany(),
    // La cadena de renovaciones apunta a sí misma: se sueltan los enlaces antes de borrar.
    prisma.renovacion.updateMany({ data: { renovacionAnteriorId: null } }),
    prisma.renovacion.deleteMany(),
    prisma.vulnerabilidad.deleteMany(),
    prisma.historialControlAcceso.deleteMany(),
    prisma.controlAcceso.deleteMany(),
    // Los contadores se conservan y vuelven a 0: los códigos empiezan en CAL-001 / CAF-001.
    prisma.contadorControlAcceso.updateMany({ data: { ultimo: 0 } }),
    prisma.activo.deleteMany(),
    prisma.categoria.deleteMany(),
    prisma.criticidad.deleteMany(),
  ]);
}
