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
import { MotivoDto } from '../../audit/dto/traza.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { AmpliarPlazoDto, EventoAgendaDto, ProgramarVerificacionDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  EjecucionRespaldoDto,
  ModificarEjecucionDto,
  ModificarRestauracionDto,
  PaginatedEjecucionRespaldoDto,
  PaginatedRestauracionDto,
  QueryEjecucionesDto,
  QueryRestauracionesDto,
  QueryTableroDto,
  RegistrarEjecucionDto,
  RegistrarRestauracionDto,
  RestauracionDto,
} from './dto/ejecucion.dto.js';
import {
  CrearPlanesDto,
  ModificarPlanDto,
  PaginatedPlanRespaldoDto,
  PlanRespaldoDto,
  QueryPlanesDto,
} from './dto/plan.dto.js';
import { EjecucionesRespaldoService, RestauracionesService } from './ejecuciones.service.js';
import { PlanesRespaldoService } from './planes.service.js';
import { TableroRespaldosDto, TableroRespaldosService } from './tablero.service.js';

const errores = [
  ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' }),
  ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' }),
];
const Errores = (): ClassDecorator => (target) => {
  for (const d of errores) d(target);
};

@ApiTags('respaldos')
@Errores()
@Controller('respaldos/agenda')
export class AgendaRespaldosController {
  constructor(private readonly tablero: TableroRespaldosService) {}

  @ApiOperation({
    summary: 'Agenda (calendario) de las tres capas',
    description: 'Ventanas previstas, ejecuciones reales, pruebas previstas y restauraciones reales del rango, con filtros.',
  })
  @ApiOkResponse({ type: [EventoAgendaDto] })
  @Get()
  agenda(@Query() q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    return this.tablero.agenda(q);
  }
}

@ApiTags('respaldos')
@Errores()
@Controller('respaldos/tablero')
export class TableroRespaldosController {
  constructor(private readonly tablero: TableroRespaldosService) {}

  @ApiOperation({
    summary: 'Indicadores y calendarios de respaldos',
    description: 'Indicadores RES-00…RES-07 y ventanas de ejecución y de prueba del período (por defecto, el trimestre actual).',
  })
  @ApiOkResponse({ type: TableroRespaldosDto })
  @Get()
  ver(@Query() q: QueryTableroDto): Promise<TableroRespaldosDto> {
    return this.tablero.tablero(q.desde, q.hasta);
  }
}

@ApiTags('respaldos')
@Errores()
@Controller('respaldos/planes')
export class PlanesRespaldoController {
  constructor(private readonly planes: PlanesRespaldoService) {}

  @ApiOperation({ summary: 'Paso 1 · Planes de respaldo', description: 'Incluye los anulados, marcados (incluirAnulados=false los oculta).' })
  @ApiOkResponse({ type: PaginatedPlanRespaldoDto })
  @Get()
  listar(@Query() q: QueryPlanesDto): Promise<Paginated<PlanRespaldoDto>> {
    return this.planes.findAll(q);
  }

  @ApiOperation({ summary: 'Detalle de un plan de respaldo' })
  @ApiOkResponse({ type: PlanRespaldoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  ver(@Param('id', ParseIntPipe) id: number): Promise<PlanRespaldoDto> {
    return this.planes.findOne(id);
  }

  @ApiOperation({
    summary: 'Incorporar activos al plan de respaldo (admin, analista)',
    description: 'Crea un plan por cada activo seleccionado, con los mismos parámetros. Solo activos operativos sin plan vigente.',
  })
  @ApiCreatedResponse({ type: [PlanRespaldoDto] })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Datos inválidos o activo no operativo.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Algún activo ya tiene un plan vigente.' })
  @Roles('admin', 'analista')
  @Post()
  crear(@Body() dto: CrearPlanesDto): Promise<PlanRespaldoDto[]> {
    return this.planes.crear(dto);
  }

  @ApiOperation({ summary: 'Modificar un plan con motivo (admin, analista)', description: 'Sube la versión y conserva la anterior. El activo no se cambia.' })
  @ApiOkResponse({ type: PlanRespaldoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Anulado, modificado entretanto, o dejaría dos planes vigentes.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  modificar(@Param('id', ParseIntPipe) id: number, @Body() dto: ModificarPlanDto, @CurrentUser() u: AuthUser) {
    return this.planes.modificar(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular un plan (eliminación lógica, admin)' })
  @ApiOkResponse({ type: PlanRespaldoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.planes.anular(id, dto.motivo, u);
  }

  @ApiOperation({ summary: 'Revertir la anulación de un plan (admin)' })
  @ApiOkResponse({ type: PlanRespaldoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.planes.reversar(id, dto.motivo, u);
  }
}

@ApiTags('respaldos')
@Errores()
@Controller('respaldos/ejecuciones')
export class EjecucionesRespaldoController {
  constructor(private readonly ejecuciones: EjecucionesRespaldoService) {}

  @ApiOperation({ summary: 'Paso 2 · Respaldos ejecutados', description: 'Filtros por activo, plan, resultado y período (desde/hasta).' })
  @ApiOkResponse({ type: PaginatedEjecucionRespaldoDto })
  @Get()
  listar(@Query() q: QueryEjecucionesDto): Promise<Paginated<EjecucionRespaldoDto>> {
    return this.ejecuciones.findAll(q);
  }

  @ApiOperation({ summary: 'Detalle de una ejecución de respaldo' })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  ver(@Param('id', ParseIntPipe) id: number): Promise<EjecucionRespaldoDto> {
    return this.ejecuciones.findOne(id);
  }

  @ApiOperation({ summary: 'Registrar la ejecución de un respaldo (admin, analista)', description: 'Sobre un plan vigente de un activo operativo; la fecha no puede ser futura.' })
  @ApiCreatedResponse({ type: EjecucionRespaldoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Post()
  registrar(@Body() dto: RegistrarEjecucionDto, @CurrentUser() u: AuthUser): Promise<EjecucionRespaldoDto> {
    return this.ejecuciones.registrar(dto, u);
  }

  @ApiOperation({
    summary: 'Programar la prueba de restauración (admin, analista)',
    description: 'Capa 3: ventana prevista [prevista, límite] de la prueba de esta copia; tiene su propio plazo.',
  })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @Roles('admin', 'analista')
  @Patch(':id/prueba')
  programarPrueba(@Param('id', ParseIntPipe) id: number, @Body() dto: ProgramarVerificacionDto, @CurrentUser() u: AuthUser) {
    return this.ejecuciones.programarPrueba(id, dto, u);
  }

  @ApiOperation({ summary: 'Ampliar el plazo de la prueba de restauración (solo admin)' })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @Roles('admin')
  @Patch(':id/plazo-prueba')
  ampliarPlazoPrueba(@Param('id', ParseIntPipe) id: number, @Body() dto: AmpliarPlazoDto, @CurrentUser() u: AuthUser) {
    return this.ejecuciones.ampliarPlazoPrueba(id, dto, u);
  }

  @ApiOperation({ summary: 'Modificar una ejecución con motivo (admin, analista)' })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @Roles('admin', 'analista')
  @Patch(':id')
  modificar(@Param('id', ParseIntPipe) id: number, @Body() dto: ModificarEjecucionDto, @CurrentUser() u: AuthUser) {
    return this.ejecuciones.modificar(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular una ejecución (eliminación lógica, admin)' })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.ejecuciones.anular(id, dto.motivo, u);
  }

  @ApiOperation({ summary: 'Revertir la anulación de una ejecución (admin)' })
  @ApiOkResponse({ type: EjecucionRespaldoDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.ejecuciones.reversar(id, dto.motivo, u);
  }
}

@ApiTags('respaldos')
@Errores()
@Controller('respaldos/restauraciones')
export class RestauracionesController {
  constructor(private readonly restauraciones: RestauracionesService) {}

  @ApiOperation({ summary: 'Paso 3 · Restauraciones y pruebas' })
  @ApiOkResponse({ type: PaginatedRestauracionDto })
  @Get()
  listar(@Query() q: QueryRestauracionesDto): Promise<Paginated<RestauracionDto>> {
    return this.restauraciones.findAll(q);
  }

  @ApiOperation({ summary: 'Detalle de una restauración' })
  @ApiOkResponse({ type: RestauracionDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  ver(@Param('id', ParseIntPipe) id: number): Promise<RestauracionDto> {
    return this.restauraciones.findOne(id);
  }

  @ApiOperation({ summary: 'Registrar una restauración o prueba (admin, analista)', description: 'Sobre una ejecución no fallida ni anulada; no puede ser anterior a ella ni futura.' })
  @ApiCreatedResponse({ type: RestauracionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Post()
  registrar(@Body() dto: RegistrarRestauracionDto, @CurrentUser() u: AuthUser): Promise<RestauracionDto> {
    return this.restauraciones.registrar(dto, u);
  }

  @ApiOperation({ summary: 'Modificar una restauración con motivo (admin, analista)' })
  @ApiOkResponse({ type: RestauracionDto })
  @Roles('admin', 'analista')
  @Patch(':id')
  modificar(@Param('id', ParseIntPipe) id: number, @Body() dto: ModificarRestauracionDto, @CurrentUser() u: AuthUser) {
    return this.restauraciones.modificar(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular una restauración (eliminación lógica, admin)' })
  @ApiOkResponse({ type: RestauracionDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.restauraciones.anular(id, dto.motivo, u);
  }

  @ApiOperation({ summary: 'Revertir la anulación de una restauración (admin)' })
  @ApiOkResponse({ type: RestauracionDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.restauraciones.reversar(id, dto.motivo, u);
  }
}
