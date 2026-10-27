import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
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
import { MotivoDto } from '../audit/dto/traza.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import type { Paginated } from '../common/dto/paginated-response.dto.js';
import {
  ActualizarEjecucionDto,
  CrearRenovacionDto,
  DatosEjecucionDto,
  EditarPlanificacionDto,
  PaginatedRenovacionDto,
  QueryCaducidadesDto,
  QueryRenovacionesDto,
  ReabrirRenovacionDto,
  RenovacionDto,
  ResumenVigenciasDto,
} from './dto.js';
import { RenovacionesService } from './renovaciones.service.js';

/**
 * Renovaciones en dos fases, Planificación y Ejecución y cierre, sobre el mismo
 * registro. Consultar: todos los roles. Planificar y ejecutar: admin y analista.
 * Las reglas (transiciones, fechas, evidencia) se validan aquí, no en la interfaz.
 */
@ApiTags('renovaciones')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('renovaciones')
export class RenovacionesController {
  constructor(private readonly renovaciones: RenovacionesService) {}

  @ApiOperation({
    summary: 'Listar renovaciones',
    description: 'Paginado. Filtros por sistema, categoría, tipo, estado del proceso, responsable, vigencia del elemento y rango de caducidad.',
  })
  @ApiOkResponse({ type: PaginatedRenovacionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() q: QueryRenovacionesDto): Promise<Paginated<RenovacionDto>> {
    return this.renovaciones.findAll(q);
  }

  @ApiOperation({ summary: 'Resumen de vigencias', description: 'Vigentes, próximas a caducar (umbral RENOVACIONES_DIAS_AVISO), caducadas y sin caducidad.' })
  @ApiOkResponse({ type: ResumenVigenciasDto })
  @Get('resumen')
  resumen(): Promise<ResumenVigenciasDto> {
    return this.renovaciones.resumen();
  }

  @ApiOperation({ summary: 'Próximas caducidades', description: 'Lo que caduca en los próximos días y lo ya caducado, de lo que rige hoy, por urgencia.' })
  @ApiOkResponse({ type: [RenovacionDto] })
  @Get('caducidades')
  caducidades(@Query() q: QueryCaducidadesDto): Promise<RenovacionDto[]> {
    return this.renovaciones.caducidades(q);
  }

  @ApiOperation({ summary: 'Detalle de una renovación' })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RenovacionDto> {
    return this.renovaciones.findOne(id);
  }

  // ── Fase 1 · Planificación ──

  @ApiOperation({
    summary: 'Planificar (admin, analista)',
    description: 'Crea la renovación en ABIERTO. Exige la caducidad actual o «sin caducidad» justificado. Enlaza con la renovación anterior del mismo elemento.',
  })
  @ApiCreatedResponse({ type: RenovacionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Datos inválidos o activo inexistente/no operativo.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ese elemento ya tiene una renovación pendiente.' })
  @Roles('admin', 'analista')
  @Post()
  crear(@Body() dto: CrearRenovacionDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.crear(dto, usuario);
  }

  @ApiOperation({ summary: 'Corregir la planificación con motivo (admin, analista)', description: 'Mientras está pendiente; sistema y tipo solo en ABIERTO.' })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarPlanificacionDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.editarPlanificacion(id, dto, usuario);
  }

  // ── Fase 2 · Ejecución y cierre ──

  @ApiOperation({ summary: 'Iniciar la ejecución (admin, analista)', description: 'ABIERTO → EN_PROGRESO.' })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/iniciar')
  iniciar(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.iniciar(id, usuario);
  }

  @ApiOperation({
    summary: 'Guardar o corregir lo ejecutado (admin, analista; cerrada: solo admin con motivo)',
    description: 'Fecha real, nueva caducidad, verificable, repositorio, descripción y observación. No cambia el estado.',
  })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Patch(':id/ejecucion')
  actualizarEjecucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEjecucionDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<RenovacionDto> {
    return this.renovaciones.actualizarEjecucion(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Cerrar (admin, analista)',
    description: 'ABIERTO o EN_PROGRESO → CERRADO. Exige fecha REAL de renovación, nueva caducidad (o «sin caducidad» justificado), verificable y repositorio. El mensaje dice qué falta.',
  })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Falta algún dato obligatorio o las fechas no son coherentes.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: DatosEjecucionDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.cerrar(id, dto, usuario);
  }

  @ApiOperation({ summary: 'Reabrir (admin, analista)', description: 'CERRADO → EN_PROGRESO, con motivo. No si ya la sustituyó otra renovación.' })
  @ApiOkResponse({ type: RenovacionDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Patch(':id/reabrir')
  reabrir(@Param('id', ParseIntPipe) id: number, @Body() dto: ReabrirRenovacionDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.reabrir(id, dto, usuario);
  }

  // ── Registro ──

  @ApiOperation({ summary: 'Anular (eliminación lógica, solo admin)' })
  @ApiOkResponse({ type: RenovacionDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.anular(id, dto.motivo, usuario);
  }

  @ApiOperation({ summary: 'Revertir la anulación (solo admin)' })
  @ApiOkResponse({ type: RenovacionDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() usuario: AuthUser): Promise<RenovacionDto> {
    return this.renovaciones.reversar(id, dto.motivo, usuario);
  }
}
