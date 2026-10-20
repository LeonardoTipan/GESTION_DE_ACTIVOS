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
import type { ActivoBreveDto } from '../common/dto/registro.dto.js';
import { ControlAccesoService } from './control-acceso.service.js';
import {
  CategoriaElegibleDto,
  CerrarControlAccesoDto,
  ControlAccesoDto,
  CrearControlAccesoDto,
  EditarControlAccesoDto,
  HistorialControlAccesoDto,
  PaginatedActivoElegibleDto,
  PaginatedControlAccesoDto,
  QueryActivosElegiblesDto,
  QueryCategoriasElegiblesDto,
  QueryControlAccesoDto,
  ReabrirControlAccesoDto,
} from './dto.js';

/**
 * Permisos: consultar (incluido el historial), todos los roles; registrar,
 * modificar, pasar a pendiente y cerrar, admin y analista; reabrir, solo admin.
 * El historial no tiene rutas de escritura: solo lo escribe el propio servicio.
 */
@ApiTags('control-acceso')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('control-acceso')
export class ControlAccesoController {
  constructor(private readonly servicio: ControlAccesoService) {}

  @ApiOperation({ summary: 'Listar solicitudes', description: 'Búsqueda y filtros por tipo, estado, tipo de solicitud, fechas deseadas y situación.' })
  @ApiOkResponse({ type: PaginatedControlAccesoDto })
  @Get()
  findAll(@Query() q: QueryControlAccesoDto): Promise<Paginated<ControlAccesoDto>> {
    return this.servicio.findAll(q);
  }

  // Rutas fijas antes que /:id.
  @ApiOperation({
    summary: 'Activos elegibles para un tipo de acceso',
    description: 'Vigentes y operativos, de categorías que admiten el tipo (Catálogos). Filtrados en el servidor.',
  })
  @ApiOkResponse({ type: PaginatedActivoElegibleDto })
  @Get('activos-elegibles')
  activosElegibles(@Query() q: QueryActivosElegiblesDto): Promise<Paginated<ActivoBreveDto>> {
    return this.servicio.activosElegibles(q);
  }

  @ApiOperation({ summary: 'Categorías con activos elegibles (con su número)' })
  @ApiOkResponse({ type: [CategoriaElegibleDto] })
  @Get('categorias-elegibles')
  categoriasElegibles(@Query() q: QueryCategoriasElegiblesDto): Promise<CategoriaElegibleDto[]> {
    return this.servicio.categoriasElegibles(q.tipoAcceso);
  }

  @ApiOperation({ summary: 'Detalle de una solicitud' })
  @ApiOkResponse({ type: ControlAccesoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ControlAccesoDto> {
    return this.servicio.findOne(id);
  }

  @ApiOperation({ summary: 'Historial de auditoría (solo lectura)' })
  @ApiOkResponse({ type: [HistorialControlAccesoDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id/historial')
  historial(@Param('id', ParseIntPipe) id: number): Promise<HistorialControlAccesoDto[]> {
    return this.servicio.historial(id);
  }

  @ApiOperation({ summary: 'Registrar una solicitud', description: 'Queda ABIERTA con su código CAL-/CAF-nnn, generado por el backend.' })
  @ApiCreatedResponse({ type: ControlAccesoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Post()
  crear(@Body() dto: CrearControlAccesoDto, @CurrentUser() u: AuthUser): Promise<ControlAccesoDto> {
    return this.servicio.crear(dto, u);
  }

  @ApiOperation({ summary: 'Modificar una solicitud no cerrada', description: 'Cada campo cambiado queda en el historial.' })
  @ApiOkResponse({ type: ControlAccesoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Cerrada, o cambió entre medias.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarControlAccesoDto, @CurrentUser() u: AuthUser): Promise<ControlAccesoDto> {
    return this.servicio.editar(id, dto, u);
  }

  @ApiOperation({ summary: 'ABIERTO → PENDIENTE' })
  @ApiOkResponse({ type: ControlAccesoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Transición no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/pendiente')
  pendiente(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser): Promise<ControlAccesoDto> {
    return this.servicio.marcarPendiente(id, u);
  }

  @ApiOperation({ summary: 'Cerrar (ABIERTO o PENDIENTE → CERRADO)', description: 'Exige la resolución; la fecha de atención es la del servidor.' })
  @ApiOkResponse({ type: ControlAccesoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Transición no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: CerrarControlAccesoDto, @CurrentUser() u: AuthUser): Promise<ControlAccesoDto> {
    return this.servicio.cerrar(id, dto, u);
  }

  @ApiOperation({ summary: 'Reabrir (CERRADO → PENDIENTE), solo admin, con motivo' })
  @ApiOkResponse({ type: ControlAccesoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'No está cerrada.' })
  @Roles('admin')
  @Patch(':id/reabrir')
  reabrir(@Param('id', ParseIntPipe) id: number, @Body() dto: ReabrirControlAccesoDto, @CurrentUser() u: AuthUser): Promise<ControlAccesoDto> {
    return this.servicio.reabrir(id, dto, u);
  }
}
