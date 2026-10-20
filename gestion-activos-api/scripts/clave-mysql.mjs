// Copia la clave pública RSA de MySQL a certs/mysql-public-key.pem (npm run db:clave-mysql).
//
// La API la usa para autenticarse con caching_sha2_password sin TLS después de
// un reinicio de MySQL (ver src/prisma/conexion.ts). Se toma del sistema de
// archivos del propio servidor con `docker cp`, un canal de confianza, en vez
// de aceptar la que envíe quien responda por la red. Es una clave PÚBLICA: no
// es un secreto, pero es propia de cada instalación y no se versiona.
// Repetir solo si se recrea el contenedor o el volumen de datos de MySQL.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';

const contenedor = process.env.MYSQL_CONTAINER ?? 'servidor-mysql';
const destino = 'certs/mysql-public-key.pem';
const temporal = `${destino}.tmp`;

mkdirSync('certs', { recursive: true });
try {
  execFileSync('docker', ['cp', `${contenedor}:/var/lib/mysql/public_key.pem`, temporal], { stdio: 'pipe' });
  // MySQL termina el archivo con un byte nulo.
  const clave = readFileSync(temporal, 'utf8');
  if (!/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----[\s\0]*$/.test(clave)) {
    throw new Error('El archivo copiado no es una clave pública PEM.');
  }
  renameSync(temporal, destino);
  console.log(`Clave pública de ${contenedor} guardada en ${destino}.`);
} catch (e) {
  rmSync(temporal, { force: true });
  console.error(`No se pudo obtener la clave de ${contenedor}: ${e.stderr?.toString().trim() || e.message}`);
  process.exit(1);
}
