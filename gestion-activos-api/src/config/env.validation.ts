import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

const URL_OPTIONS = {
  require_tld: false,
  require_protocol: true,
  protocols: ['http', 'https'],
};

/** Variables obligatorias. Si falta alguna o es inválida, la aplicación no arranca. */
class EnvironmentVariables {
  /** Cadena de conexión a MySQL: mysql://usuario:clave@host:puerto/base */
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  /** URL por la que la API alcanza Keycloak (para descargar las claves JWKS). */
  @IsUrl(URL_OPTIONS)
  KEYCLOAK_URL: string;

  @IsString()
  @IsNotEmpty()
  KEYCLOAK_REALM: string;

  /** Valor exacto del claim "iss" de los tokens (URL pública del realm). */
  @IsUrl(URL_OPTIONS)
  KEYCLOAK_ISSUER: string;

  /** Valor que debe venir en el claim "aud" de los tokens. */
  @IsString()
  @IsNotEmpty()
  KEYCLOAK_AUDIENCE: string;

  /** Orígenes del frontend autorizados por CORS, separados por comas. */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  /** URL pública de la API vista desde el navegador (Swagger). Por defecto http://localhost:PORT. */
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  API_PUBLIC_URL?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env);
  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Variables de entorno inválidas o ausentes:\n${detail}`);
  }
  return config;
}
