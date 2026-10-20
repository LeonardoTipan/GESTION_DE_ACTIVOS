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
import { CriticidadesService } from './criticidades.service.js';
import {
  CreateCriticidadDto,
  CriticidadDto,
  UpdateCriticidadDto,
} from './dto/criticidad.dto.js';

@ApiTags('criticidades')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('criticidades')
export class CriticidadesController {
  constructor(private readonly criticidades: CriticidadesService) {}

  @ApiOperation({
    summary: 'Listar niveles de criticidad',
    description: 'Lista completa (para selectores).',
  })
  @ApiOkResponse({ type: CriticidadDto, isArray: true })
  @Get()
  findAll(): Promise<CriticidadDto[]> {
    return this.criticidades.findAll();
  }

  @ApiOperation({ summary: 'Crear nivel de criticidad (admin)' })
  @ApiCreatedResponse({ type: CriticidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El nivel ya existe.',
  })
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateCriticidadDto): Promise<CriticidadDto> {
    return this.criticidades.create(dto);
  }

  @ApiOperation({ summary: 'Modificar nivel de criticidad (admin)' })
  @ApiOkResponse({ type: CriticidadDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El nivel ya existe.',
  })
  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCriticidadDto,
  ): Promise<CriticidadDto> {
    return this.criticidades.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar nivel de criticidad (admin)',
    description: 'Solo si ningún activo lo usa.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Hay activos con este nivel.',
  })
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.criticidades.remove(id);
  }
}
