import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

type OpcionesDriver = ConstructorParameters<typeof PrismaMariaDb>[0];

/** Ruta por defecto de la clave pública RSA de MySQL (relativa a gestion-activos-api). */
export const CLAVE_RSA_POR_DEFECTO = 'certs/mysql-public-key.pem';

/**
 * Opciones del driver a partir de DATABASE_URL.
 *
 * MySQL 8+ autentica con caching_sha2_password. Tras reiniciar MySQL su caché
 * de credenciales está vacía y, en una conexión sin TLS, el cliente debe cifrar
 * la contraseña con la clave pública RSA del servidor; sin ella el driver falla
 * con ER_CANNOT_RETRIEVE_RSA_KEY y la API responde 500.
 *
 * Se FIJA esa clave (archivo de `DATABASE_RSA_PUBLIC_KEY` o, si existe,
 * certs/mysql-public-key.pem) en lugar de pedírsela al servidor en cada
 * conexión (allowPublicKeyRetrieval), que aceptaría la clave de cualquiera que
 * suplantase al servidor. Sin archivo se usa la URL tal cual.
 */
export function opcionesConexion(
  url: string,
  rutaClave = process.env.DATABASE_RSA_PUBLIC_KEY,
): OpcionesDriver {
  const ruta = rutaClave?.trim() || (existsSync(resolve(CLAVE_RSA_POR_DEFECTO)) ? CLAVE_RSA_POR_DEFECTO : '');
  if (!ruta) return url;
  const absoluta = resolve(ruta);
  if (!existsSync(absoluta)) {
    throw new Error(
      `No existe la clave pública de MySQL indicada en DATABASE_RSA_PUBLIC_KEY (${ruta}). Obténla con "npm run db:clave-mysql".`,
    );
  }
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    // El driver lee el archivo cuando hace falta la autenticación completa.
    cachingRsaPublicKey: absoluta,
  };
}

/** Adaptador de Prisma para MySQL con las opciones anteriores. */
export function adaptadorMySql(url: string): PrismaMariaDb {
  return new PrismaMariaDb(opcionesConexion(url));
}

/** Errores de credenciales: reintentar no los arregla. */
export function esErrorDeAutenticacion(e: unknown): boolean {
  const texto = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`;
  return /ER_CANNOT_RETRIEVE_RSA_KEY|ER_ACCESS_DENIED|Access denied|RSA public key/i.test(texto);
}
