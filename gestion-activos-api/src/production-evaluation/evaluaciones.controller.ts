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
import { EventoAgendaDto, QueryAgendaDto } from '../common/dto/agenda.dto.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import type { Paginated } from '../common/dto/paginated-response.dto.js';
import {
  BitacoraEvaluacionDto,
  DatosEjecucionEvaluacionDto,
  EvaluacionSistemaDto,
  PaginatedEvaluacionSistemaDto,
  PlanificarEvaluacionDto,
  QueryBitacoraEspecificaEvaluacionDto,
  QueryBitacoraEvaluacionDto,
  QueryEvaluacionesDto,
  ReabrirEvaluacionDto,
} from './dto.js';
import { EvaluacionesService } from './evaluaciones.service.js';

/** Consultar: todos los roles. Planificar, guardar avance y cerrar: admin y analista. Reabrir: solo admin. */
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

  // Rutas fijas antes de ':id'.
  @ApiOperation({
    summary: 'Bitácora General por semestres',
    description:
      'Por semestre (S1 ene–jun, S2 jul–dic): planificadas en su semestre PLANIFICADO (fecha programada), cumplidas a tiempo y tarde, ' +
      'pendientes, vencidas, cerradas por semestre REAL (fecha de las pruebas) y % de cumplimiento. Las anuladas no cuentan.',
  })
  @ApiOkResponse({ type: BitacoraEvaluacionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('bitacora/general')
  bitacoraGeneral(@Query() q: QueryBitacoraEvaluacionDto): Promise<BitacoraEvaluacionDto> {
    return this.evaluaciones.bitacoraGeneral(q);
  }

  @ApiOperation({
    summary: 'Bitácora Específica',
    description: 'Una fila por evaluación (sin anuladas), con su semestre planificado y real y su situación. Filtros: año y semestre planificados, sistema, asignado y situación. Paginada.',
  })
  @ApiOkResponse({ type: PaginatedEvaluacionSistemaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('bitacora/especifica')
  bitacoraEspecifica(@Query() q: QueryBitacoraEspecificaEvaluacionDto): Promise<Paginated<EvaluacionSistemaDto>> {
    return this.evaluaciones.bitacoraEspecifica(q);
  }

  @ApiOperation({ summary: 'Agenda del calendario', description: 'Paso a producción programado (previsto) y pruebas de seguridad reales, en un rango.' })
  @ApiOkResponse({ type: [EventoAgendaDto] })
  @Get('agenda')
  agenda(@Query() q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    return this.evaluaciones.agenda(q);
  }

  @ApiOperation({ summary: 'Consultar una evaluación' })
  @ApiOkResponse({ type: EvaluacionSistemaDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<EvaluacionSistemaDto> {
    return this.evaluaciones.findOne(id);
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

  // ── Fase 2 · Ejecución y cierre ──

  @ApiOperation({
    summary: 'Guardar avance de la ejecución (admin, analista)',
    description: 'Fecha real de las pruebas, informe, repositorio y observación. Deja la evaluación EN_PROGRESO; no la cierra. Una CERRADA hay que reabrirla antes.',
  })
  @ApiOkResponse({ type: EvaluacionSistemaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Fecha futura o repositorio no válido.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Evaluación cerrada o anulada, o modificada entretanto.' })
  @Roles('admin', 'analista')
  @Patch(':id/ejecucion')
  registrarEjecucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DatosEjecucionEvaluacionDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<EvaluacionSistemaDto> {
    return this.evaluaciones.registrarEjecucion(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Cerrar la evaluación (admin, analista)',
    description:
      'ABIERTO o EN_PROGRESO → CERRADO. Exige la fecha REAL de las pruebas (no futura), el informe (verificable) y su repositorio. ' +
      'Si las pruebas fueron posteriores a la fecha programada, también la observación (≥ 20 caracteres). El mensaje dice qué falta.',
  })
  @ApiOkResponse({ type: EvaluacionSistemaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Falta algún dato o no es válido.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: DatosEjecucionEvaluacionDto, @CurrentUser() usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    return this.evaluaciones.cerrar(id, dto, usuario);
  }

  @ApiOperation({ summary: 'Reabrir (solo admin)', description: 'CERRADO → EN_PROGRESO, con motivo. Los datos se conservan para corregirlos.' })
  @ApiOkResponse({ type: EvaluacionSistemaDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'La evaluación no está cerrada.' })
  @Roles('admin')
  @Patch(':id/reabrir')
  reabrir(@Param('id', ParseIntPipe) id: number, @Body() dto: ReabrirEvaluacionDto, @CurrentUser() usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    return this.evaluaciones.reabrir(id, dto, usuario);
  }
}
