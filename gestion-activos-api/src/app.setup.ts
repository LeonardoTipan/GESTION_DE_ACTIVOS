import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Prefijo de todas las rutas: /api/... (el frontend/Nginx enruta /api/* al backend). */
export const API_PREFIX = 'api';

/**
 * Configuración HTTP común. La usan main.ts y los tests e2e, para que los
 * tests ejerciten exactamente la misma API que se despliega.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      // Elimina del body las propiedades que el DTO no declara...
      whitelist: true,
      // ...y además rechaza la petición (400) si llegan: el frontend se entera del error.
      forbidNonWhitelisted: true,
      // Convierte el JSON en instancias del DTO y los parámetros de ruta a su tipo (p. ej. :id → number).
      transform: true,
    }),
  );

  // El frontend se sirve desde otro origen: el navegador solo le permite llamar
  // a la API (con el header Authorization) si la API autoriza ese origen.
  // Sin cookies: la sesión viaja como Bearer token, así que no hace falta credentials.
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
}
