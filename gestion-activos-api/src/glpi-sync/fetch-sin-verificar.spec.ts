import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchSinVerificarTls } from './fetch-sin-verificar.js';

describe('fetchSinVerificarTls', () => {
  let servidor: http.Server;
  let base: string;
  const recibido: { metodo?: string; cabeceras?: http.IncomingHttpHeaders; cuerpo?: string } = {};

  beforeAll(async () => {
    servidor = http.createServer((peticion, respuesta) => {
      let cuerpo = '';
      peticion.on('data', (trozo) => (cuerpo += trozo));
      peticion.on('end', () => {
        Object.assign(recibido, {
          metodo: peticion.method,
          cabeceras: peticion.headers,
          cuerpo,
        });
        respuesta.writeHead(peticion.url === '/parcial' ? 206 : 200, {
          'Content-Type': 'application/json',
          'Content-Range': '0-9/25',
        });
        respuesta.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((cerrado) => servidor.close(cerrado)));

  it('GET: devuelve estado, cabeceras y cuerpo como el fetch estándar', async () => {
    const respuesta = await fetchSinVerificarTls(`${base}/parcial`, {
      headers: { Authorization: 'Bearer abc' },
    });
    expect(respuesta.status).toBe(206);
    expect(respuesta.ok).toBe(true);
    expect(respuesta.headers.get('Content-Range')).toBe('0-9/25');
    expect(await respuesta.json()).toEqual({ ok: true });
    expect(recibido.cabeceras?.authorization).toBe('Bearer abc');
  });

  it('POST: envía el formulario del token', async () => {
    await fetchSinVerificarTls(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', scope: 'api' }),
    });
    expect(recibido.metodo).toBe('POST');
    expect(recibido.cuerpo).toBe('grant_type=password&scope=api');
  });

  it('un fallo de red se rechaza (no se queda colgado)', async () => {
    await expect(fetchSinVerificarTls('http://127.0.0.1:1/')).rejects.toThrow();
  });
});
