import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  BitacoraDto,
  PaginatedBitacoraDto,
} from '../bitacora/dto/bitacora.dto.js';
import { ActivosService } from './activos.service.js';
import { ActivoDto, PaginatedActivoDto } from './dto/activo.dto.js';
import { CreateActivoDto, UpdateActivoDto } from './dto/create-activo.dto.js';
import { QueryActivosDto } from './dto/query-activos.dto.js';

@ApiTags('activos')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('activos')
export class ActivosController {
  constructor(private readonly activos: ActivosService) {}

  @ApiOperation({
    summary: 'Listar activos',
    description:
      'Paginado, con búsqueda, filtros, orden y sincronización incremental (actualizadoDesde).',
  })
  @ApiOkResponse({ type: PaginatedActivoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Parámetros de consulta inválidos.',
  })
  @Get()
  findAll(@Query() query: QueryActivosDto): Promise<Paginated<ActivoDto>> {
    return this.activos.findAll(query);
  }

  @ApiOperation({ summary: 'Detalle de un activo vigente' })
  @ApiOkResponse({ type: ActivoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ActivoDto> {
    return this.activos.findOne(id);
  }

  @ApiOperation({
    summary: 'Historial de cambios del activo',
    description:
      'Del más reciente al más antiguo. Disponible también para activos dados de baja.',
  })
  @ApiOkResponse({ type: PaginatedBitacoraDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id/bitacora')
  historial(
    @Param('id', ParseIntPipe) id: number,
    @Query() paginacion: PaginationQueryDto,
  ): Promise<Paginated<BitacoraDto>> {
    return this.activos.historial(id, paginacion);
  }

  @ApiOperation({ summary: 'Registrar activo (admin, analista)' })
  @ApiCreatedResponse({ type: ActivoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o categoría/criticidad inexistente.',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El código ya existe.',
  })
  @Roles('admin', 'analista')
  @Post()
  create(
    @Body() dto: CreateActivoDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivoDto> {
    return this.activos.create(dto, user);
  }

  @ApiOperation({
    summary: 'Modificar activo (admin, analista)',
    description: 'Solo cambia los campos enviados.',
  })
  @ApiOkResponse({ type: ActivoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El código ya existe.',
  })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivoDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivoDto> {
    return this.activos.update(id, dto, user);
  }

  @ApiOperation({
    summary: 'Dar de baja un activo (admin)',
    description: 'Baja lógica: conserva el historial.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.activos.remove(id, user);
  }
}
