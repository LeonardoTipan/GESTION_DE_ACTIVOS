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
import { EvaluacionSistemaDto, PaginatedEvaluacionSistemaDto, PlanificarEvaluacionDto, QueryEvaluacionesDto } from './dto.js';
import { EvaluacionesService } from './evaluaciones.service.js';

/** Consultar: todos los roles. Planificar: admin y analista. */
@ApiTags('evaluaciones-sistemas')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('evaluaciones-sistemas')
export class EvaluacionesController {
  constructor(private readonly evaluaciones: EvaluacionesService) {}

  @ApiOperation({
    summary: 'Listar las evaluaciones planificadas',
    description: 'Paginado, por fecha programada de paso a producción. Filtros por sistema, estado, pendientes, vencidas, rango de fechas y texto.',
  })
  @ApiOkResponse({ type: PaginatedEvaluacionSistemaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() q: QueryEvaluacionesDto): Promise<Paginated<EvaluacionSistemaDto>> {
    return this.evaluaciones.findAll(q);
  }

  @ApiOperation({
    summary: 'Planificar una evaluación (admin, analista)',
    description: 'Fase 1. El sistema debe estar operativo y su categoría habilitada para Evaluación; una sola evaluación pendiente por sistema.',
  })
  @ApiCreatedResponse({ type: EvaluacionSistemaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Datos no válidos, activo no operativo o categoría no habilitada.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'El sistema ya tiene una evaluación pendiente.' })
  @Roles('admin', 'analista')
  @Post()
  planificar(@Body() dto: PlanificarEvaluacionDto, @CurrentUser() usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    return this.evaluaciones.planificar(dto, usuario);
  }
}
