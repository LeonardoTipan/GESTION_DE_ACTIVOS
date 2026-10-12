import { GlpiClient, GlpiError, type GlpiItem } from './glpi-client.js';
import {
  CREDENCIALES_PRUEBA,
  glpiFalso,
  type DatosGlpiFalso,
} from './testing/glpi-falso.js';

const equipos = (n: number): GlpiItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `PC-${i + 1}` }));

function montar(datos: DatosGlpiFalso, credenciales = CREDENCIALES_PRUEBA) {
  const falso = glpiFalso(datos);
  const reloj = { ahora: 1_000_000 };
  const cliente = new GlpiClient({
    apiUrl: 'https://glpi.test/api.php',
    apiVersion: 'v2',
    credenciales,
    timeoutMs: 1000,
    fetch: falso.fetch,
    ahora: () => reloj.ahora,
  });
  return { falso, cliente, reloj };
}

async function todos(generador: AsyncGenerator<GlpiItem[]>): Promise<GlpiItem[][]> {
  const bloques: GlpiItem[][] = [];
  for await (const bloque of generador) bloques.push(bloque);
  return bloques;
}

describe('GlpiClient · autenticación OAuth2', () => {
  it('pide el token con POST /token en x-www-form-urlencoded (grant password)', async () => {
    const { falso, cliente } = montar({ elementos: {} });
    await cliente.autenticar();
    expect(falso.peticiones[0]).toMatchObject({
      metodo: 'POST',
      ruta: '/token',
      cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' },
      formulario: {
        grant_type: 'password',
        client_id: 'cliente',
        client_secret: 'secreto',
        username: 'sync',
        password: 'clave-de-prueba',
        scope: 'api',
      },
    });
  });

  it('usa el token como Bearer en las peticiones', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(1) } });
    await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Computer', { tamano: 10 })),
    );
    expect(falso.peticiones[1].cabeceras.Authorization).toBe('Bearer token-1');
  });

  it('cada ciclo empieza con un token fresco', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(1) } });
    const ciclo = () =>
      cliente.conSesion(() => todos(cliente.listarPorBloques('Computer', { tamano: 10 })));
    await ciclo();
    await ciclo();
    expect(falso.tokensEmitidos()).toBe(2);
    expect(falso.peticiones.at(-1)!.cabeceras.Authorization).toBe('Bearer token-2');
  });

  it('reutiliza el token dentro del ciclo: 3 bloques, 1 solo token', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(25) } });
    await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Computer', { tamano: 10 })),
    );
    expect(falso.tokensEmitidos()).toBe(1);
  });

  it('lo renueva solo cuando está a punto de caducar (sincronizaciones largas)', async () => {
    const { falso, cliente, reloj } = montar({
      elementos: { Computer: equipos(25) },
      expiresIn: 3600,
    });
    await cliente.conSesion(async () => {
      const bloques = cliente.listarPorBloques('Computer', { tamano: 10 });
      await bloques.next();
      reloj.ahora += 3590 * 1000; // quedan 10 s de vida: menos que el margen
      await bloques.next();
    });
    expect(falso.tokensEmitidos()).toBe(2);
    expect(falso.peticiones.at(-1)!.cabeceras.Authorization).toBe('Bearer token-2');
  });

  it('si GLPI responde 401 (token revocado), se reautentica y reintenta una vez', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(25) } });
    const bloques = await cliente.conSesion(async () => {
      const generador = cliente.listarPorBloques('Computer', { tamano: 10 });
      const primero = (await generador.next()).value as GlpiItem[];
      falso.invalidarTokens();
      const segundo = (await generador.next()).value as GlpiItem[];
      return [primero, segundo];
    });
    expect(bloques.map((b) => b.length)).toEqual([10, 10]);
    expect(falso.tokensEmitidos()).toBe(2);
  });

  it('credenciales incorrectas: error claro, sin filtrar la contraseña', async () => {
    const { cliente } = montar(
      { elementos: {} },
      { ...CREDENCIALES_PRUEBA, clave: 'clave-equivocada' },
    );
    const error = await cliente.autenticar().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GlpiError);
    expect(error).toMatchObject({ status: 400, codigo: 'invalid_grant' });
    expect((error as Error).message).toContain('Credenciales incorrectas');
    expect((error as Error).message).not.toContain('clave-equivocada');
    expect((error as Error).message).not.toContain('secreto');
  });

  it('descarta el token al terminar, aunque la tarea falle', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(1) } });
    await expect(
      cliente.conSesion(() => Promise.reject(new Error('fallo a mitad'))),
    ).rejects.toThrow('fallo a mitad');
    // La siguiente petición no reutiliza el token anterior: pide otro.
    await todos(cliente.listarPorBloques('Computer', { tamano: 10 }));
    expect(falso.tokensEmitidos()).toBe(2);
  });
});

describe('GlpiClient · paginación por bloques', () => {
  const paginas = (falso: ReturnType<typeof glpiFalso>) =>
    falso.peticiones
      .filter((p) => p.ruta.startsWith('/v2/Assets/'))
      .map((p) => {
        const q = new URLSearchParams(p.ruta.split('?')[1]);
        return `${q.get('start')}+${q.get('limit')}`;
      });

  it('25 elementos de 10 en 10 → start 0, 10 y 20', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(25) } });
    const bloques = await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Computer', { tamano: 10 })),
    );
    expect(bloques.map((b) => b.length)).toEqual([10, 10, 5]);
    expect(bloques.flat().map((e) => e.id)).toEqual(equipos(25).map((e) => e.id));
    expect(paginas(falso)).toEqual(['0+10', '10+10', '20+10']);
  });

  it('usa la ruta versionada de activos y orden estable por id', async () => {
    const { falso, cliente } = montar({ elementos: { NetworkEquipment: equipos(1) } });
    await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('NetworkEquipment', { tamano: 10 })),
    );
    const [ruta, consulta] = falso.peticiones[1].ruta.split('?');
    expect(ruta).toBe('/v2/Assets/NetworkEquipment');
    expect(new URLSearchParams(consulta).get('sort')).toBe('id:asc');
  });

  it('con max=10 y 25 disponibles hace UNA petición de 10', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(25) } });
    const bloques = await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Computer', { tamano: 10, max: 10 })),
    );
    expect(bloques.flat()).toHaveLength(10);
    expect(paginas(falso)).toEqual(['0+10']);
  });

  it('max que no es múltiplo del bloque: 10 + 5', async () => {
    const { falso, cliente } = montar({ elementos: { Computer: equipos(40) } });
    const bloques = await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Computer', { tamano: 10, max: 15 })),
    );
    expect(bloques.map((b) => b.length)).toEqual([10, 5]);
    expect(paginas(falso)).toEqual(['0+10', '10+5']);
  });

  it('un tipo sin elementos no devuelve bloques', async () => {
    const { cliente } = montar({ elementos: { Software: [] } });
    const bloques = await cliente.conSesion(() =>
      todos(cliente.listarPorBloques('Software', { tamano: 10 })),
    );
    expect(bloques).toEqual([]);
  });
});
