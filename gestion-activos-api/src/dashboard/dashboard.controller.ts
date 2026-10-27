import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { DashboardService } from './dashboard.service.js';
import { PendientesTableroDto } from './dto.js';

// Sin @Roles: como los listados de los cuatro módulos, lo consultan admin, analista
// y auditor (los guards globales exigen sesión válida). No hay alcance por departamento.
@ApiTags('dashboard')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Falta el token o no es válido' })
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('pendientes')
  @ApiOperation({
    summary: 'Trámites pendientes por módulo',
    description:
      'Conteo en la base de los registros abiertos o en curso de Control de acceso, Mantenimientos, Vulnerabilidades y Renovaciones, y su total. Si un conteo falla responde 500; nunca devuelve 0 en su lugar.',
  })
  @ApiOkResponse({ type: PendientesTableroDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorDto, description: 'Algún conteo falló' })
  pendientes(): Promise<PendientesTableroDto> {
    return this.dashboard.pendientes();
  }
}
