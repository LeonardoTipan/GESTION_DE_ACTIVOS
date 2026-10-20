import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { esErrorDeAutenticacion, opcionesConexion } from './conexion.js';

describe('conexión a MySQL', () => {
  const URL_PRUEBA = 'mysql://usuario:cl%40ve%3Asecreta@db.local:3307/inventario';

  it('con la clave pública fijada: opciones del driver con la ruta absoluta y credenciales decodificadas', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'clave-')), 'public_key.pem');
    writeFileSync(ruta, '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n');
    expect(opcionesConexion(URL_PRUEBA, ruta)).toEqual({
      host: 'db.local',
      port: 3307,
      user: 'usuario',
      password: 'cl@ve:secreta',
      database: 'inventario',
      cachingRsaPublicKey: ruta,
    });
  });

  it('una ruta indicada que no existe falla al arrancar, con la forma de obtenerla', () => {
    expect(() => opcionesConexion(URL_PRUEBA, 'no/existe.pem')).toThrow(/db:clave-mysql/);
  });

  it('distingue los errores de credenciales (no se reintentan) de los de disponibilidad', () => {
    expect(esErrorDeAutenticacion({ code: 'ER_CANNOT_RETRIEVE_RSA_KEY', message: '' })).toBe(true);
    expect(esErrorDeAutenticacion(new Error("Access denied for user 'x'@'y'"))).toBe(true);
    expect(esErrorDeAutenticacion(new Error('connect ECONNREFUSED 127.0.0.1:3306'))).toBe(false);
  });
});
