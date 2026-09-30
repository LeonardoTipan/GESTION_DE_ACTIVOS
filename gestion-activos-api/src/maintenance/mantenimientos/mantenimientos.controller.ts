import {
  Body,
  Controller,
  Get,
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
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  CancelarMantenimientoDto,
  FinalizarMantenimientoDto,
  IniciarMantenimientoDto,
  ProgramarMantenimientoDto,
} from './dto/acciones.dto.js';
import {
  MantenimientoDto,
  PaginatedMantenimientoDto,
} from './dto/mantenimiento.dto.js';
import { QueryMantenimientosDto } from './dto/query-mantenimientos.dto.js';
import { MantenimientosService } from './mantenimientos.service.js';

@ApiTags('mantenimientos')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('mantenimientos')
export class MantenimientosController {
  constructor(private readonly mantenimientos: MantenimientosService) {}

  @ApiOperation({
    summary: 'Listar mantenimientos',
    description:
      'Paginado por fecha programada. Filtros por activo, tipo, fase, estado del equipo, ' +
      'rango de fechas (calendario), vencidos y sincronización incremental.',
  })
  @ApiOkResponse({ type: PaginatedMantenimientoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(
    @Query() query: QueryMantenimientosDto,
  ): Promise<Paginated<MantenimientoDto>> {
    return this.mantenimientos.findAll(query);
  }

  @ApiOperation({ summary: 'Detalle de un mantenimiento' })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<MantenimientoDto> {
    return this.mantenimientos.findOne(id);
  }

  @ApiOperation({
    summary: 'Programar mantenimiento (admin, analista)',
    description: 'Crea el mantenimiento en fase PROGRAMADO.',
  })
  @ApiCreatedResponse({ type: MantenimientoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o activo inexistente/dado de baja.',
  })
  @Roles('admin', 'analista')
  @Post()
  programar(@Body() dto: ProgramarMantenimientoDto): Promise<MantenimientoDto> {
    return this.mantenimientos.programar(dto);
  }

  @ApiOperation({
    summary: 'Iniciar (admin, analista)',
    description: 'PROGRAMADO → EN_EJECUCION.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/iniciar')
  iniciar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IniciarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.iniciar(id, dto);
  }

  @ApiOperation({
    summary: 'Finalizar (admin, analista)',
    description:
      'EN_EJECUCION → FINALIZADO. Registra resultado y estado del equipo.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o fecha de fin anterior al inicio.',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/finalizar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.finalizar(id, dto);
  }

  @ApiOperation({
    summary: 'Cancelar (admin, analista)',
    description: 'PROGRAMADO o EN_EJECUCION → CANCELADO, con motivo.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.cancelar(id, dto);
  }
}
