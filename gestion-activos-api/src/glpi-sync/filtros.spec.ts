/**
 * Filtros de la consulta incremental: formato de la fecha, zona horaria y
 * diferencia entre "lista vacía" y "error".
 */
import { GlpiClient, GlpiError, type GlpiItem } from './glpi-client.js';
import { desfaseCoincide, fechaLocalDeZona } from './saneamiento.js';
import { CREDENCIALES_PRUEBA, glpiFalso } from './testing/glpi-falso.js';

const equipo = (id: number, date_mod: string, extra: object = {}): GlpiItem => ({
  id,
  name: `Equipo ${id}`,
  is_deleted: false,
  date_mod,
  ...extra,
});

function montar(elementos: GlpiItem[], extra: object = {}) {
  const falso = glpiFalso({ elementos: { Computer: elementos }, ...extra });
  const cliente = new GlpiClient({
    apiUrl: 'https://glpi.test/api.php',
    apiVersion: 'v2',
    credenciales: CREDENCIALES_PRUEBA,
    timeoutMs: 1000,
    fetch: falso.fetch,
  });
  const leer = async (filtro?: string, tamano = 10) => {
    const ids: number[] = [];
    await cliente.conSesion(async () => {
      for await (const bloque of cliente.listarPorBloques('Computer', { tamano, filtro })) {
        ids.push(...bloque.map((x) => x.id));
      }
    });
    return ids;
  };
  return { falso, leer };
}

describe('fechaLocalDeZona · la hora que entiende el filtro de GLPI', () => {
  it('convierte un instante UTC a la hora local de Quito, sin desfase', () => {
    expect(fechaLocalDeZona(new Date('2026-10-12T19:04:31.000Z'), 'America/Guayaquil')).toBe(
      '2026-10-12T14:04:31',
    );
    // Cruce de medianoche: las 02:00 UTC son las 21:00 del día anterior en Quito.
    expect(fechaLocalDeZona(new Date('2026-10-13T02:00:00.000Z'), 'America/Guayaquil')).toBe(
      '2026-10-12T21:00:00',
    );
  });

  it('respeta el horario de verano de las zonas que lo tienen', () => {
    expect(fechaLocalDeZona(new Date('2026-07-01T10:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-07-01T12:00:00',
    );
    expect(fechaLocalDeZona(new Date('2026-01-01T10:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-01-01T11:00:00',
    );
  });
});

describe('desfaseCoincide · comprobación de GLPI_TIMEZONE', () => {
  it('las fechas de GLPI (-05:00) coinciden con America/Guayaquil y no con otras zonas', () => {
    const fecha = '2026-10-12T14:04:31-05:00';
    expect(desfaseCoincide(fecha, 'America/Guayaquil')).toBe(true);
    expect(desfaseCoincide(fecha, 'America/Bogota')).toBe(true); // mismo desfase
    expect(desfaseCoincide(fecha, 'UTC')).toBe(false);
    expect(desfaseCoincide(fecha, 'Europe/Madrid')).toBe(false);
  });

  it('sin desfase en la fecha no se puede comprobar', () => {
    expect(desfaseCoincide('2026-10-12 14:04:31', 'America/Guayaquil')).toBeNull();
    expect(desfaseCoincide(null, 'America/Guayaquil')).toBeNull();
    expect(desfaseCoincide('2026-10-12T19:04:31Z', 'UTC')).toBe(true);
  });
});

describe('GlpiClient · listado con filtro', () => {
  const elementos = [
    equipo(1, '2026-10-12T09:00:00-05:00'),
    equipo(2, '2026-10-12T14:04:31-05:00'),
    equipo(3, '2026-10-12T16:00:00-05:00', { is_deleted: true }),
  ];

  it('envía el filtro RSQL y recibe solo lo modificado desde esa hora local', async () => {
    const { falso, leer } = montar(elementos);
    expect(await leer('date_mod=ge=2026-10-12T14:04:31')).toEqual([2, 3]);
    expect(await leer('date_mod=ge=2026-10-12T14:04:32')).toEqual([3]);
    const consulta = new URLSearchParams(falso.peticiones.at(-1)!.ruta.split('?')[1]);
    expect(consulta.get('filter')).toBe('date_mod=ge=2026-10-12T14:04:32');
    expect(consulta.get('sort')).toBe('id:asc');
  });

  it('la papelera se puede pedir expresamente, sola o combinada con la fecha', async () => {
    const { leer } = montar(elementos, { papeleraOculta: true });
    expect(await leer()).toEqual([1, 2]);
    expect(await leer('is_deleted==1')).toEqual([3]);
    expect(await leer('is_deleted==1;date_mod=ge=2026-10-12T17:00:00')).toEqual([]);
  });

  it('sin resultados: lista vacía, NO un error', async () => {
    const { leer } = montar(elementos);
    await expect(leer('date_mod=ge=2030-01-01T00:00:00')).resolves.toEqual([]);
  });

  it('un filtro que GLPI no entiende es un error 400, NO una lista vacía', async () => {
    const { leer } = montar(elementos);
    await expect(leer('campo_inexistente==1')).rejects.toMatchObject({
      name: 'GlpiError',
      status: 400,
      codigo: 'ERROR_INVALID_PARAMETER',
    });
  });

  it('si GLPI anuncia más elementos de los que entrega, la lectura se da por incompleta', async () => {
    const falso = glpiFalso({ elementos: { Computer: elementos } });
    // El inventario "encoge" a mitad de la paginación: el segundo bloque llega vacío.
    const fetchRaro = ((url: string, init?: RequestInit) =>
      String(url).includes('start=2')
        ? Promise.resolve(
            new Response('[]', { status: 200, headers: { 'Content-Range': '2-1/3' } }),
          )
        : falso.fetch(url, init)) as typeof fetch;
    const cliente = new GlpiClient({
      apiUrl: 'https://glpi.test/api.php',
      apiVersion: 'v2',
      credenciales: CREDENCIALES_PRUEBA,
      timeoutMs: 1000,
      fetch: fetchRaro,
    });
    const leer = cliente.conSesion(async () => {
      for await (const _ of cliente.listarPorBloques('Computer', { tamano: 2 })) {
        // solo se recorre
      }
    });
    await expect(leer).rejects.toBeInstanceOf(GlpiError);
    await expect(leer).rejects.toMatchObject({ codigo: 'LECTURA_INCOMPLETA' });
  });
});
