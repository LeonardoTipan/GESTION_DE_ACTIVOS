import { ITEMTYPES, leerConfig } from './config.js';

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
  it('valores por defecto seguros: simulación, bloques de 10 y todos los tipos de GLPI', () => {
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
      itemtypes: ITEMTYPES,
      criticidadPorDefecto: 'Media',
      cron: '*/15 * * * *',
      modo: 'auto',
      origen: 'CONSOLA',
      ventanaSeguridadMin: 15,
      reconciliacionHoras: 24,
      bloqueoCaducaMin: 30,
      confirmarBajasMasivas: false,
    });
  });

  it('GLPI_SYNC_MODO solo admite auto, completa o incremental', () => {
    expect(leerConfig({ ...BASE, GLPI_SYNC_MODO: 'Completa' }).modo).toBe('completa');
    expect(() => leerConfig({ ...BASE, GLPI_SYNC_MODO: 'rapido' })).toThrow('GLPI_SYNC_MODO');
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
        GLPI_ITEMTYPES: 'Computer,Cartridge',
        GLPI_TAMANO_BLOQUE: '0',
      }),
    ).toThrow(
      /Falta GLPI_API_URL[\s\S]*Falta DATABASE_URL[\s\S]*Falta GLPI_CLIENT_ID[\s\S]*Falta GLPI_CLIENT_SECRET[\s\S]*Falta GLPI_USERNAME[\s\S]*Falta GLPI_PASSWORD[\s\S]*"Quito"[\s\S]*Monitor[\s\S]*GLPI_TAMANO_BLOQUE/,
    );
  });

  it('GLPI_IGNORE_SSL: apagado por defecto, solo "true" lo activa y nunca en producción', () => {
    expect(leerConfig(BASE).ignorarSsl).toBe(false);
    expect(leerConfig({ ...BASE, GLPI_IGNORE_SSL: '1' }).ignorarSsl).toBe(false);
    expect(leerConfig({ ...BASE, GLPI_IGNORE_SSL: 'true' }).ignorarSsl).toBe(true);
    expect(() =>
      leerConfig({ ...BASE, GLPI_IGNORE_SSL: 'true', NODE_ENV: 'production' }),
    ).toThrow('no está permitido con NODE_ENV=production');
  });

  it('código institucional: desactivado sin etiqueta; formato por defecto de 4 grupos numéricos', () => {
    const { codigoInstitucional } = leerConfig(BASE);
    expect(codigoInstitucional.etiqueta).toBe('');
    expect(codigoInstitucional.formato.test('7-1-22-177')).toBe(true);
    expect(codigoInstitucional.formato.test('7-1722-47')).toBe(false);
    expect(codigoInstitucional.formato.test('7-1-7-22--76')).toBe(false);

    const propia = leerConfig({
      ...BASE,
      GLPI_CODIGO_INSTITUCIONAL_ETIQUETA: 'QUITO TURISMO',
      GLPI_CODIGO_INSTITUCIONAL_FORMATO: '^QT-\\d+$',
    }).codigoInstitucional;
    expect(propia.etiqueta).toBe('QUITO TURISMO');
    expect(propia.formato.test('QT-15')).toBe(true);

    expect(() =>
      leerConfig({ ...BASE, GLPI_CODIGO_INSTITUCIONAL_FORMATO: '(' }),
    ).toThrow('no es una expresión regular válida');
  });

  it('exige la zona horaria: no hay valor por defecto', () => {
    expect(() => leerConfig({ ...BASE, GLPI_TIMEZONE: '' })).toThrow('Falta GLPI_TIMEZONE');
  });
});

describe('categoría por tipo de equipo', () => {
  it('reconoce los servidores sin importar tildes, mayúsculas ni espacios', async () => {
    const { categoriaDeTipoDeEquipo } = await import('./config.js');
    expect(categoriaDeTipoDeEquipo('Computer', 'Servidor Físico')).toBe('Servidores físicos');
    expect(categoriaDeTipoDeEquipo('Computer', '  servidor   fisico ')).toBe('Servidores físicos');
    expect(categoriaDeTipoDeEquipo('Computer', 'SERVIDOR VIRTUAL')).toBe('Servidores virtuales');
    expect(categoriaDeTipoDeEquipo('Computer', 'Laptop')).toBeNull();
    expect(categoriaDeTipoDeEquipo('Computer', null)).toBeNull();
    expect(categoriaDeTipoDeEquipo('Monitor', 'Servidor Físico')).toBeNull();
  });
});
