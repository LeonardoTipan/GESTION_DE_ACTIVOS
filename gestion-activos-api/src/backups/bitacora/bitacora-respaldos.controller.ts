import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { BitacoraIndicadorDto, QueryBitacoraIndicadorDto } from '../../common/bitacora/dto.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import { BitacoraRespaldosService } from './bitacora-respaldos.service.js';
import { FilaBitacoraRespaldoDto, PaginatedFilaBitacoraRespaldoDto, QueryBitacoraEspecificaRespaldosDto } from './dto.js';

/** Bitácora de Respaldos y restauración: solo lectura, todos los roles. */
@ApiTags('respaldos')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('respaldos/bitacora')
export class BitacoraRespaldosController {
  constructor(private readonly bitacora: BitacoraRespaldosService) {}

  @ApiOperation({
    summary: 'Bitácora General (mensual)',
    description:
      'Indicador del Excel «Respaldo de seguridad validados / Total programados» por mes: ventanas de ejecución exigibles de ' +
      'los planes vigentes en su momento y, de ellas, las cubiertas por una ejecución EXITOSA. Pruebas de restauración aparte.',
  })
  @ApiOkResponse({ type: BitacoraIndicadorDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('general')
  general(@Query() q: QueryBitacoraIndicadorDto): Promise<BitacoraIndicadorDto> {
    return this.bitacora.general(q.anio);
  }

  @ApiOperation({
    summary: 'Bitácora Específica',
    description: 'Una fila por ventana programada: sistema, ejecución que la cubre (resultado, responsable, evidencia) y su prueba de restauración.',
  })
  @ApiOkResponse({ type: PaginatedFilaBitacoraRespaldoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get('especifica')
  especifica(@Query() q: QueryBitacoraEspecificaRespaldosDto): Promise<Paginated<FilaBitacoraRespaldoDto>> {
    return this.bitacora.especifica(q);
  }
}
