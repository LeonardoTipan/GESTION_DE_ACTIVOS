import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const OAUTH2_SCHEME = 'keycloak';

/** Cliente público de Keycloak con PKCE (el mismo que usará el frontend). No es un secreto. */
const SWAGGER_CLIENT_ID = 'gestion-activos-web';

/**
 * Documentación OpenAPI en /api/docs (UI) y /api/docs-json (contrato para el frontend).
 * El botón "Authorize" inicia sesión en Keycloak con Authorization Code + PKCE,
 * igual que lo hará el frontend, y Swagger envía el token en cada petición.
 */
export function setupSwagger(app: INestApplication): void {
  const config = app.get(ConfigService);
  // URL pública del realm: la abre el NAVEGADOR, no el servidor.
  const issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER');
  // URL pública de la API tal como la ve el navegador.
  const apiPublicUrl =
    config.get<string>('API_PUBLIC_URL') ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Gestión de Activos API')
      .setDescription(
        'API REST del aplicativo de Gestión de Activos. Todos los endpoints ' +
          'exigen un access token de Keycloak, salvo los indicados como públicos.',
      )
      .setVersion('0.1.0')
      .addOAuth2(
        {
          type: 'oauth2',
          description: 'Inicio de sesión con Keycloak (realm gestion-activos).',
          flows: {
            authorizationCode: {
              authorizationUrl: `${issuer}/protocol/openid-connect/auth`,
              tokenUrl: `${issuer}/protocol/openid-connect/token`,
              scopes: { openid: 'Identidad OpenID Connect' },
            },
          },
        },
        OAUTH2_SCHEME,
      )
      // Seguro por defecto también en la documentación.
      .addSecurityRequirements(OAUTH2_SCHEME, ['openid'])
      .build(),
  );

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'Gestión de Activos API',
    swaggerOptions: {
      persistAuthorization: true,
      // Si no se fija, Swagger UI la deduce de la URL del navegador: con /api/docs
      // (sin "/" final) calcula /api/oauth2-redirect.html y el retorno da 404.
      // Debe coincidir con una "Valid redirect URI" del cliente en Keycloak.
      oauth2RedirectUrl: `${apiPublicUrl}/${SWAGGER_PATH}/oauth2-redirect.html`,
      initOAuth: {
        clientId: SWAGGER_CLIENT_ID,
        usePkceWithAuthorizationCodeGrant: true,
        scopes: ['openid'],
      },
    },
  });
}
