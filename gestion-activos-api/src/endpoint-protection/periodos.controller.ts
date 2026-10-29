import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import type { Paginated } from '../common/dto/paginated-response.dto.js';
import { AbrirPeriodoDto, PaginatedPeriodoEndpointDto, PeriodoEndpointDto, QueryPeriodosDto } from './dto.js';
import { PeriodosEndpointService } from './periodos.service.js';

/** Consultar: todos los roles. Abrir un período: admin y analista. */
@ApiTags('proteccion-endpoints')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('proteccion-endpoints/periodos')
export class PeriodosEndpointController {
  constructor(private readonly periodos: PeriodosEndpointService) {}

  @ApiOperation({ summary: 'Listar los períodos mensuales', description: 'Paginado, del más reciente al más antiguo. Filtros por año y estado.' })
  @ApiOkResponse({ type: PaginatedPeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() q: QueryPeriodosDto): Promise<Paginated<PeriodoEndpointDto>> {
    return this.periodos.findAll(q);
  }

  @ApiOperation({ summary: 'Abrir un período mensual (admin, analista)', description: 'Fase 1. Mes en curso o anterior; uno solo por año y mes.' })
  @ApiCreatedResponse({ type: PeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ese mes ya tiene período.' })
  @Roles('admin', 'analista')
  @Post()
  abrir(@Body() dto: AbrirPeriodoDto, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.abrir(dto, usuario);
  }
}
