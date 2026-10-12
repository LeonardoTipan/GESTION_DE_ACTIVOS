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
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  CreateRespaldoDto,
  RegistrarEjecucionDto,
  RegistrarPruebaDto,
  UpdateRespaldoDto,
} from './dto/capas.dto.js';
import { QueryRespaldosDto } from './dto/query-respaldos.dto.js';
import { PaginatedRespaldoDto, RespaldoDto } from './dto/respaldo.dto.js';
import { RespaldosService } from './respaldos.service.js';

@ApiTags('respaldos')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('respaldos')
export class RespaldosController {
  constructor(private readonly respaldos: RespaldosService) {}

  @ApiOperation({
    summary: 'Listar respaldos',
    description:
      'Paginado, del más reciente al más antiguo. Filtros por activo, etapa y estados; ' +
      'sincronización incremental con actualizadoDesde.',
  })
  @ApiOkResponse({ type: PaginatedRespaldoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() query: QueryRespaldosDto): Promise<Paginated<RespaldoDto>> {
    return this.respaldos.findAll(query);
  }

  @ApiOperation({ summary: 'Detalle de un respaldo' })
  @ApiOkResponse({ type: RespaldoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RespaldoDto> {
    return this.respaldos.findOne(id);
  }

  @ApiOperation({
    summary: 'Capa 1 · Definir alcance (admin, analista)',
    description: 'Crea el respaldo en etapa PENDIENTE_EJECUCION.',
  })
  @ApiCreatedResponse({ type: RespaldoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o activo inexistente/dado de baja.',
  })
  @Roles('admin', 'analista')
  @Post()
  create(@Body() dto: CreateRespaldoDto): Promise<RespaldoDto> {
    return this.respaldos.create(dto);
  }

  @ApiOperation({
    summary: 'Capa 2 · Registrar ejecución (admin, analista)',
    description: 'Solo una vez, mientras la ejecución está PENDIENTE.',
  })
  @ApiOkResponse({ type: RespaldoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'La ejecución ya fue registrada.',
  })
  @Roles('admin', 'analista')
  @Patch(':id/ejecucion')
  registrarEjecucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarEjecucionDto,
  ): Promise<RespaldoDto> {
    return this.respaldos.registrarEjecucion(id, dto);
  }

  @ApiOperation({
    summary: 'Capa 3 · Registrar restauración/prueba (admin, analista)',
    description: 'Solo una vez y solo si la ejecución fue EXITOSA.',
  })
  @ApiOkResponse({ type: RespaldoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o fecha anterior a la ejecución.',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Ejecución no exitosa o prueba ya registrada.',
  })
  @Roles('admin', 'analista')
  @Patch(':id/prueba')
  registrarPrueba(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPruebaDto,
  ): Promise<RespaldoDto> {
    return this.respaldos.registrarPrueba(id, dto);
  }

  @ApiOperation({
    summary: 'Editar (admin, analista)',
    description: 'Corrige el alcance. Solo mientras la ejecución está PENDIENTE.',
  })
  @ApiOkResponse({ type: RespaldoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'La ejecución ya fue registrada.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRespaldoDto,
  ): Promise<RespaldoDto> {
    return this.respaldos.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar (solo admin)',
    description:
      'Borrado definitivo del respaldo, en cualquier estado. No afecta al activo ni a su historial.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.respaldos.remove(id);
  }
}
