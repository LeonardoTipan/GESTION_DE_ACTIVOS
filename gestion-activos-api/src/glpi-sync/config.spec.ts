import { leerConfig } from './config.js';

const BASE = {
  DATABASE_URL: 'mysql://u:c@localhost:3306/gestion_activos_db',
  GLPI_API_URL: 'https://glpi.empresa.com/api.php/',
  GLPI_CLIENT_ID: 'cliente',
  GLPI_CLIENT_SECRET: 'secreto',
  GLPI_USERNAME: 'sync',
  GLPI_PASSWORD: ' clave con espacios ',
  GLPI_TIMEZONE: 'America/Guayaquil',
};

describe('leerConfig', () => {
  it('valores por defecto seguros: simulación, bloques de 10 y los 3 tipos', () => {
    expect(leerConfig(BASE)).toMatchObject({
      apiUrl: 'https://glpi.empresa.com/api.php',
      apiVersion: 'v2',
      credenciales: {
        clientId: 'cliente',
        clientSecret: 'secreto',
        usuario: 'sync',
        clave: ' clave con espacios ', // la contraseña no se recorta
        scope: 'api',
      },
      dryRun: true,
      tamanoBloque: 10,
      maxPorTipo: undefined,
      itemtypes: ['Computer', 'NetworkEquipment', 'Software'],
      criticidadPorDefecto: 'Media',
      cron: '0 2 * * *',
    });
  });

  it('solo escribe si GLPI_DRY_RUN es exactamente "false"', () => {
    expect(leerConfig({ ...BASE, GLPI_DRY_RUN: 'false' }).dryRun).toBe(false);
    for (const valor of ['true', '0', 'no', '']) {
      expect(leerConfig({ ...BASE, GLPI_DRY_RUN: valor }).dryRun).toBe(true);
    }
  });

  it('rechaza http:// con un servidor remoto (las credenciales irían sin cifrar)', () => {
    expect(() =>
      leerConfig({ ...BASE, GLPI_API_URL: 'http://glpi.empresa.com/api.php' }),
    ).toThrow('sin cifrar');
    // En local sí se admite: localhost, servicio de Docker o host.docker.internal.
    for (const url of [
      'http://localhost:8081/api.php',
      'http://glpi/api.php',
      'http://host.docker.internal:8081/api.php',
    ]) {
      expect(leerConfig({ ...BASE, GLPI_API_URL: url }).apiUrl).toBe(url);
    }
  });

  it('lista TODOS los problemas de una vez', () => {
    expect(() =>
      leerConfig({
        GLPI_TIMEZONE: 'Quito',
        GLPI_ITEMTYPES: 'Computer,Monitor',
        GLPI_TAMANO_BLOQUE: '0',
      }),
    ).toThrow(
      /Falta GLPI_API_URL[\s\S]*Falta DATABASE_URL[\s\S]*Falta GLPI_CLIENT_ID[\s\S]*Falta GLPI_CLIENT_SECRET[\s\S]*Falta GLPI_USERNAME[\s\S]*Falta GLPI_PASSWORD[\s\S]*"Quito"[\s\S]*Monitor[\s\S]*GLPI_TAMANO_BLOQUE/,
    );
  });

  it('exige la zona horaria: no hay valor por defecto', () => {
    expect(() => leerConfig({ ...BASE, GLPI_TIMEZONE: '' })).toThrow('Falta GLPI_TIMEZONE');
  });
});
