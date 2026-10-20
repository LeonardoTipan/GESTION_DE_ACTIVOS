import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import { QueryRespaldosDto } from './dto/query-respaldos.dto.js';
import { PaginatedRespaldoDto, RespaldoDto } from './dto/respaldo.dto.js';
import { RespaldosService } from './respaldos.service.js';

/** Registros anteriores al plan de respaldo: se conservan y solo se consultan. */
@ApiTags('respaldos')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('respaldos/anteriores')
export class RespaldosController {
  constructor(private readonly respaldos: RespaldosService) {}

  @ApiOperation({
    summary: 'Registros anteriores de respaldos (solo lectura)',
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

  @ApiOperation({ summary: 'Detalle de un registro anterior de respaldo' })
  @ApiOkResponse({ type: RespaldoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RespaldoDto> {
    return this.respaldos.findOne(id);
  }
}
