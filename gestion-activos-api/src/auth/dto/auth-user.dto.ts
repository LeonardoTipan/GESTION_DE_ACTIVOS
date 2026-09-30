import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuthUser } from '../interfaces/auth-user.interface.js';
import { APP_ROLES, type AppRole } from '../roles.js';

/** Respuesta de GET /api/auth/me (documentada en Swagger). */
export class AuthUserDto implements AuthUser {
  @ApiProperty({
    description: 'ID inmutable del usuario en Keycloak (claim "sub").',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'analista.test' })
  username: string;

  @ApiPropertyOptional({ example: 'analista.test@gestion-activos.local' })
  email?: string;

  @ApiPropertyOptional({ example: 'Analista Prueba' })
  name?: string;

  @ApiProperty({ enum: APP_ROLES, isArray: true, example: ['analista'] })
  roles: AppRole[];
}
