import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import { BitacoraMantenimientoService } from './bitacora-mantenimiento.service.js';
import {
  BitacoraGeneralDto,
  FilaBitacoraDto,
  PaginatedFilaBitacoraDto,
  QueryBitacoraEspecificaDto,
  QueryBitacoraGeneralDto,
} from './dto.js';

/** Bitácoras del mantenimiento: solo lectura, para todos los roles (también auditor). */
@ApiTags('mantenimientos')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('mantenimientos/bitacora')
export class BitacoraMantenimientoController {
  constructor(private readonly bitacora: BitacoraMantenimientoService) {}

  @ApiOperation({
    summary: 'Bitácora General',
    description:
      'Por semestre del año (S1 ene–jun, S2 jul–dic): planificaciones, cumplidas (al menos una ejecución completada, ' +
      'sin doble conteo), pendientes, ejecuciones completadas por semestre REAL y % de cumplimiento. ' +
      'Las planificaciones se cuentan en su semestre PLANIFICADO. Los anulados no cuentan.',
  })
  @ApiOkResponse({ type: BitacoraGeneralDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('general')
  general(@Query() query: QueryBitacoraGeneralDto): Promise<BitacoraGeneralDto> {
    return this.bitacora.general(query);
  }

  @ApiOperation({
    summary: 'Bitácora Específica',
    description:
      'Una fila por ejecución, con su planificación, y una por planificación aún sin ejecuciones. ' +
      'Filtros: año y semestre planificados, activo, tipo, responsable y situación. Paginada.',
  })
  @ApiOkResponse({ type: PaginatedFilaBitacoraDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('especifica')
  especifica(@Query() query: QueryBitacoraEspecificaDto): Promise<Paginated<FilaBitacoraDto>> {
    return this.bitacora.especifica(query);
  }
}
