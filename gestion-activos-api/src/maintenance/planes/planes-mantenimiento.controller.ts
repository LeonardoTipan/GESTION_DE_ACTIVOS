import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MotivoDto } from '../../audit/dto/traza.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { EventoAgendaDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  CrearPlanesMantenimientoDto,
  ModificarPlanMantenimientoDto,
  PaginatedPlanMantenimientoDto,
  PlanMantenimientoDto,
  ProgramacionDesdePlanDto,
  ProgramarDesdePlanDto,
  QueryPlanesMantenimientoDto,
  TableroMantenimientosDto,
} from './dto.js';
import { PlanesMantenimientoService } from './planes-mantenimiento.service.js';

@ApiTags('mantenimientos')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('mantenimientos')
export class PlanesMantenimientoController {
  constructor(private readonly planes: PlanesMantenimientoService) {}

  @ApiOperation({
    summary: 'Agenda (calendario) de la planificación y la ejecución',
    description: 'Eventos PREVISTOS (intervalos planificados) y REALES (lo ejecutado) en el rango, con filtros.',
  })
  @ApiOkResponse({ type: [EventoAgendaDto] })
  @Get('agenda')
  agenda(@Query() q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    return this.planes.agenda(q);
  }

  @ApiOperation({ summary: 'Tablero: próximas intervenciones, vencidas, activos sin plan y pendientes de verificar' })
  @ApiOkResponse({ type: TableroMantenimientosDto })
  @Get('tablero')
  tablero(): Promise<TableroMantenimientosDto> {
    return this.planes.tablero();
  }

  @ApiOperation({ summary: 'Capa 1 · Planes de mantenimiento' })
  @ApiOkResponse({ type: PaginatedPlanMantenimientoDto })
  @Get('planes')
  listar(@Query() q: QueryPlanesMantenimientoDto): Promise<Paginated<PlanMantenimientoDto>> {
    return this.planes.findAll(q);
  }

  @ApiOperation({ summary: 'Detalle de un plan de mantenimiento' })
  @ApiOkResponse({ type: PlanMantenimientoDto })
  @Get('planes/:id')
  ver(@Param('id', ParseIntPipe) id: number): Promise<PlanMantenimientoDto> {
    return this.planes.findOne(id);
  }

  @ApiOperation({
    summary: 'Crear planes (admin, analista)',
    description: 'Un plan por activo; solo activos operativos y sin otro plan vigente del mismo tipo.',
  })
  @ApiCreatedResponse({ type: [PlanMantenimientoDto] })
  @ApiConflictResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Post('planes')
  crear(@Body() dto: CrearPlanesMantenimientoDto, @CurrentUser() u: AuthUser): Promise<PlanMantenimientoDto[]> {
    return this.planes.crear(dto, u);
  }

  @ApiOperation({ summary: 'Modificar un plan con motivo (admin, analista)' })
  @ApiOkResponse({ type: PlanMantenimientoDto })
  @Roles('admin', 'analista')
  @Patch('planes/:id')
  modificar(@Param('id', ParseIntPipe) id: number, @Body() dto: ModificarPlanMantenimientoDto, @CurrentUser() u: AuthUser) {
    return this.planes.modificar(id, dto, u);
  }

  @ApiOperation({ summary: 'Programar la intervención prevista del plan (admin, analista)', description: 'Crea el mantenimiento (capa 2) y adelanta la próxima fecha.' })
  @ApiCreatedResponse({ type: ProgramacionDesdePlanDto })
  @Roles('admin', 'analista')
  @Post('planes/:id/programar')
  programar(@Param('id', ParseIntPipe) id: number, @Body() dto: ProgramarDesdePlanDto, @CurrentUser() u: AuthUser): Promise<ProgramacionDesdePlanDto> {
    return this.planes.programar(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular un plan (eliminación lógica, admin)' })
  @ApiOkResponse({ type: PlanMantenimientoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('planes/:id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.planes.anular(id, dto.motivo, u);
  }

  @ApiOperation({ summary: 'Revertir la anulación de un plan (admin)' })
  @ApiOkResponse({ type: PlanMantenimientoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('planes/:id/reversar')
  reversar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.planes.reversar(id, dto.motivo, u);
  }
}
