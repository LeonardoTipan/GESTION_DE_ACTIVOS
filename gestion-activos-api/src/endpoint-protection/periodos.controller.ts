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
import { BitacoraIndicadorDto, QueryBitacoraIndicadorDto } from '../common/bitacora/dto.js';
import { EventoAgendaDto, QueryAgendaDto } from '../common/dto/agenda.dto.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import type { Paginated } from '../common/dto/paginated-response.dto.js';
import {
  AbrirPeriodoDto,
  ComparacionInventarioDto,
  DatosRegistroPeriodoDto,
  EquipoPeriodoDetalleDto,
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

  @ApiOperation({ summary: 'Listar los períodos mensuales', description: 'Paginado, del más reciente al más antiguo. Filtros por año, mes y estado.' })
  @ApiOkResponse({ type: PaginatedPeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() q: QueryPeriodosDto): Promise<Paginated<PeriodoEndpointDto>> {
    return this.periodos.findAll(q);
  }

  @ApiOperation({ summary: 'Abrir un período mensual (admin, analista)', description: 'Fase 1. Con la fecha planificada (año y mes se derivan); mes en curso o anterior; uno solo por mes. Copia los equipos sujetos a control.' })
  @ApiCreatedResponse({ type: PeriodoEndpointDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ese mes ya tiene período.' })
  @Roles('admin', 'analista')
  @Post()
  abrir(@Body() dto: AbrirPeriodoDto, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.abrir(dto, usuario);
  }

  @ApiOperation({
    summary: 'Bitácora General (mensual)',
    description: 'Indicador del Excel «Equipos con antivirus activo / Total activos» por mes: del período CERRADO de cada mes (detalle por equipo o, en los anteriores, los totales registrados). Solo lectura.',
  })
  @ApiOkResponse({ type: BitacoraIndicadorDto })
  @Get('bitacora/general')
  bitacoraGeneral(@Query() q: QueryBitacoraIndicadorDto): Promise<BitacoraIndicadorDto> {
    return this.periodos.bitacoraGeneral(q.anio);
  }

  @ApiOperation({ summary: 'Agenda del calendario', description: 'El mes de cada período (previsto) y la medición real (fecha de ejecución), en un rango.' })
  @ApiOkResponse({ type: [EventoAgendaDto] })
  @Get('agenda')
  agenda(@Query() q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    return this.periodos.agenda(q);
  }

  @ApiOperation({ summary: 'Consultar un período' })
  @ApiOkResponse({ type: PeriodoEndpointDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PeriodoEndpointDto> {
    return this.periodos.findOne(id);
  }

  @ApiOperation({ summary: 'Equipos del período', description: 'Activos reales del inventario sujetos al control y si tienen antivirus.' })
  @ApiOkResponse({ type: [EquipoPeriodoDetalleDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id/equipos')
  equipos(@Param('id', ParseIntPipe) id: number): Promise<EquipoPeriodoDetalleDto[]> {
    return this.periodos.equipos(id);
  }

  @ApiOperation({
    summary: 'Equipos del período frente al inventario de hoy',
    description: 'Cuántos equipos copió el período al abrirse, cuántos son elegibles hoy, cuáles entraron después y cuáles dejaron de ser elegibles. Solo informa.',
  })
  @ApiOkResponse({ type: ComparacionInventarioDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id/comparacion-inventario')
  comparacion(@Param('id', ParseIntPipe) id: number): Promise<ComparacionInventarioDto> {
    return this.periodos.comparacion(id);
  }

  @ApiOperation({
    summary: 'Cargar los equipos (admin, analista)',
    description: 'Para un período pendiente abierto antes del detalle por equipo: copia los equipos sujetos a control de hoy. Una sola vez.',
  })
  @ApiCreatedResponse({ type: PeriodoEndpointDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ya tiene equipos, o no está pendiente.' })
  @Roles('admin', 'analista')
  @Post(':id/equipos')
  cargarEquipos(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: AuthUser): Promise<PeriodoEndpointDto> {
    return this.periodos.cargarEquipos(id, usuario);
  }

  // ── Fase 2 · Registro y cierre ──

  @ApiOperation({
    summary: 'Guardar avance del registro (admin, analista)',
    description: 'Totales, fecha real y responsable de la medición, verificable, repositorio y observación. Deja el período EN_PROGRESO; no lo cierra. Un período CERRADO hay que reabrirlo antes.',
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
    description: 'ABIERTO o EN_PROGRESO → CERRADO. Exige total de activos (≥ 1), equipos con antivirus (≤ total), fecha real y responsable de la medición, verificable y repositorio. El mensaje dice qué falta.',
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
