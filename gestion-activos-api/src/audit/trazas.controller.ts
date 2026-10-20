import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { QueryTrazasDto, TrazaDto } from './dto/traza.dto.js';
import { TrazasService } from './trazas.service.js';

@ApiTags('trazas')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('trazas')
export class TrazasController {
  constructor(private readonly trazas: TrazasService) {}

  @ApiOperation({
    summary: 'Trazas de un registro',
    description:
      'Versiones anteriores, anulaciones y reversiones de un registro de respaldos, ' +
      'mantenimientos o vulnerabilidades, del más reciente al más antiguo.',
  })
  @ApiOkResponse({ type: [TrazaDto] })
  @Get()
  listar(@Query() query: QueryTrazasDto): Promise<TrazaDto[]> {
    return this.trazas.listar(query.entidad, query.registroId);
  }
}
