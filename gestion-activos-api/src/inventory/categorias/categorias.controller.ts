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
import { CategoriasService } from './categorias.service.js';
import {
  CategoriaDto,
  CreateCategoriaDto,
  UpdateCategoriaDto,
} from './dto/categoria.dto.js';

@ApiTags('categorias')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @ApiOperation({
    summary: 'Listar categorías',
    description: 'Lista completa, ordenada por nombre (para selectores).',
  })
  @ApiOkResponse({ type: CategoriaDto, isArray: true })
  @Get()
  findAll(): Promise<CategoriaDto[]> {
    return this.categorias.findAll();
  }

  @ApiOperation({ summary: 'Crear categoría (admin)' })
  @ApiCreatedResponse({ type: CategoriaDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El nombre ya existe.',
  })
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateCategoriaDto): Promise<CategoriaDto> {
    return this.categorias.create(dto);
  }

  @ApiOperation({ summary: 'Modificar categoría (admin)' })
  @ApiOkResponse({ type: CategoriaDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El nombre ya existe.',
  })
  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaDto,
  ): Promise<CategoriaDto> {
    return this.categorias.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar categoría (admin)',
    description: 'Solo si ningún activo la usa.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Hay activos con esta categoría.',
  })
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categorias.remove(id);
  }
}
