import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import {
  AbrirPeriodoDto,
  DatosRegistroPeriodoDto,
  PaginatedPeriodoEndpointDto,
  PeriodoEndpointDto,
  QueryPeriodosDto,
  ReabrirPeriodoDto,
} from './dto.js';
import { PeriodosEndpointService } from './periodos.service.js';

/** Consultar: todos los roles. Abrir, registrar y cerrar: admin y analista. Reabrir: solo admin. */
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

  @ApiOperation({ summary: 'Consultar un período' })
  @ApiOkResponse({ type: PeriodoEndpointDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PeriodoEndpointDto> {
    return this.periodos.findOne(id);
  }

  // ── Fase 2 · Registro y cierre ──

  @ApiOperation({
    summary: 'Guardar avance del registro (admin, analista)',
    description: 'Totales, verificable, repositorio y observación. Deja el período EN_PROGRESO; no lo cierra. Un período CERRADO hay que reabrirlo antes.',
  })
  @ApiOkResponse({ type: PeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Datos incoherentes (p. ej. más equipos con antivirus que el total).' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Período cerrado o anulado, o modificado entretanto.' })
  @Roles('admin', 'analista')
  @Patch(':id/registro')
  registrar(@Param('id', ParseIntPipe) id: number, @Body() dto: DatosRegistroPeriodoDto, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.registrar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Cerrar el período (admin, analista)',
    description: 'ABIERTO o EN_PROGRESO → CERRADO. Exige total de activos (≥ 1), equipos con antivirus (≤ total), verificable y repositorio. El mensaje dice qué falta.',
  })
  @ApiOkResponse({ type: PeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Falta algún dato o no es coherente.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: DatosRegistroPeriodoDto, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.cerrar(id, dto, usuario);
  }

  @ApiOperation({ summary: 'Reabrir (solo admin)', description: 'CERRADO → EN_PROGRESO, con motivo. Los datos se conservan para corregirlos.' })
  @ApiOkResponse({ type: PeriodoEndpointDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'El período no está cerrado.' })
  @Roles('admin')
  @Patch(':id/reabrir')
  reabrir(@Param('id', ParseIntPipe) id: number, @Body() dto: ReabrirPeriodoDto, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.reabrir(id, dto, usuario);
  }
}
