import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthUser } from './interfaces/auth-user.interface.js';

@Controller('auth')
export class AuthController {
  /** Devuelve el usuario del token. Útil para que el frontend conozca nombre y roles. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
