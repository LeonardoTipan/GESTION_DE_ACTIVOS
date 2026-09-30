import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service.js';
import type {
  AuthUser,
  KeycloakJwtPayload,
} from '../interfaces/auth-user.interface.js';

/**
 * Valida los access tokens emitidos por Keycloak.
 *
 * - Firma: se verifica con la clave pública del realm, descargada del endpoint
 *   JWKS (KEYCLOAK_URL) y cacheada. Si Keycloak rota claves, se obtienen solas.
 * - Emisor: KEYCLOAK_ISSUER es la URL PÚBLICA con la que el navegador obtiene
 *   el token; puede diferir de KEYCLOAK_URL (p. ej. dentro de Docker).
 * - Solo RS256: evita tokens sin firmar ("alg": "none") o con algoritmo cambiado.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
      audience: config.getOrThrow<string>('KEYCLOAK_AUDIENCE'),
      secretOrKeyProvider: passportJwtSecret({
        jwksUri: `${config.getOrThrow<string>('KEYCLOAK_URL')}/realms/${config.getOrThrow<string>('KEYCLOAK_REALM')}/protocol/openid-connect/certs`,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
    });
  }

  /** Solo se llama si la firma, el emisor, la audiencia y la expiración son válidos. */
  validate(payload: KeycloakJwtPayload): AuthUser {
    return this.authService.toAuthUser(payload);
  }
}
