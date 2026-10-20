import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthUserDto } from './dto/auth-user.dto.js';
import type { AuthUser } from './interfaces/auth-user.interface.js';

@ApiTags('auth')
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido o expirado.',
  type: ApiErrorDto,
})
@Controller('auth')
export class AuthController {
  /** Devuelve el usuario del token. Útil para que el frontend conozca nombre y roles. */
  @ApiOperation({
    summary: 'Usuario autenticado',
    description:
      'Datos y roles del usuario del token. El frontend lo usa para decidir qué mostrar.',
  })
  @ApiOkResponse({ type: AuthUserDto })
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUserDto {
    return user;
  }
}
