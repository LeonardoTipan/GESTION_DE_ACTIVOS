import { Injectable } from '@nestjs/common';
import type {
  AuthUser,
  KeycloakJwtPayload,
} from './interfaces/auth-user.interface.js';
import { isAppRole } from './roles.js';

@Injectable()
export class AuthService {
  /** Convierte el payload ya verificado del JWT en el usuario que ve la aplicación. */
  toAuthUser(payload: KeycloakJwtPayload): AuthUser {
    return {
      id: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      name: payload.name,
      roles: (payload.realm_access?.roles ?? []).filter(isAppRole),
    };
  }
}
