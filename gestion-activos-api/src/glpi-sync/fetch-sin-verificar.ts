import http from 'node:http';
import https from 'node:https';

/**
 * ⚠️ SOLO DESARROLLO (GLPI_IGNORE_SSL=true).
 *
 * `fetch` mínimo que NO valida el certificado HTTPS del servidor. Existe para
 * poder trabajar cuando el certificado de GLPI está caducado. Sin validación,
 * un tercero en la red podría suplantar al servidor y leer las credenciales:
 * nunca debe usarse en producción.
 *
 * Solo afecta a las llamadas que hace el cliente de GLPI: no cambia la
 * verificación TLS del resto del proceso.
 */
export const fetchSinVerificarTls: typeof fetch = (entrada, init = {}) =>
  new Promise<Response>((resolver, rechazar) => {
    const url = new URL(String(entrada));
    const cuerpo =
      init.body === undefined || init.body === null
        ? undefined
        : String(init.body as string | URLSearchParams);
    const opciones: https.RequestOptions = {
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      signal: init.signal ?? undefined,
    };
    const alResponder = (respuesta: http.IncomingMessage) => {
      const trozos: Buffer[] = [];
      respuesta.on('data', (trozo: Buffer) => trozos.push(trozo));
      respuesta.on('error', rechazar);
      respuesta.on('end', () => {
        const cabeceras = new Headers();
        for (const [nombre, valor] of Object.entries(respuesta.headers)) {
          if (valor !== undefined) cabeceras.set(nombre, String(valor));
        }
        const status = respuesta.statusCode ?? 0;
        resolver(
          new Response(
            // 204 y 304 no admiten cuerpo.
            status === 204 || status === 304 ? null : Buffer.concat(trozos),
            { status, headers: cabeceras },
          ),
        );
      });
    };
    const peticion =
      url.protocol === 'https:'
        ? https.request(url, { ...opciones, rejectUnauthorized: false }, alResponder)
        : http.request(url, opciones, alResponder);
    peticion.on('error', rechazar);
    peticion.end(cuerpo);
  });
