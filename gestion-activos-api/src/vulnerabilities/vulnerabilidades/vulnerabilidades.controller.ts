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
  AceptarRiesgoDto,
  EditarVulnerabilidadDto,
  MitigarVulnerabilidadDto,
  RegistrarVulnerabilidadDto,
} from './dto/acciones.dto.js';
import { QueryVulnerabilidadesDto } from './dto/query-vulnerabilidades.dto.js';
import {
  PaginatedVulnerabilidadDto,
  VulnerabilidadDto,
} from './dto/vulnerabilidad.dto.js';
import { VulnerabilidadesService } from './vulnerabilidades.service.js';

@ApiTags('vulnerabilidades')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('vulnerabilidades')
export class VulnerabilidadesController {
  constructor(private readonly vulnerabilidades: VulnerabilidadesService) {}

  @ApiOperation({
    summary: 'Listar vulnerabilidades',
    description:
      'Ordenadas por urgencia: mayor riesgo primero y, dentro del nivel, la más antigua. ' +
      'Filtros por activo, riesgo, estado, CVE, abiertas, vencidas y sincronización incremental.',
  })
  @ApiOkResponse({ type: PaginatedVulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(
    @Query() query: QueryVulnerabilidadesDto,
  ): Promise<Paginated<VulnerabilidadDto>> {
    return this.vulnerabilidades.findAll(query);
  }

  @ApiOperation({ summary: 'Detalle de una vulnerabilidad' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.findOne(id);
  }

  @ApiOperation({
    summary: 'Registrar vulnerabilidad (admin, analista)',
    description: 'Crea la vulnerabilidad en estado ABIERTA.',
  })
  @ApiCreatedResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'Datos inválidos, CVE mal formado, fecha límite anterior a la detección o activo inexistente/dado de baja.',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'El activo ya tiene ese CVE pendiente.',
  })
  @Roles('admin', 'analista')
  @Post()
  registrar(
    @Body() dto: RegistrarVulnerabilidadDto,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.registrar(dto);
  }

  @ApiOperation({
    summary: 'Iniciar mitigación (admin, analista)',
    description: 'ABIERTA → EN_MITIGACION.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Estado no permitido.',
  })
  @Roles('admin', 'analista')
  @Patch(':id/iniciar-mitigacion')
  iniciarMitigacion(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.iniciarMitigacion(id);
  }

  @ApiOperation({
    summary: 'Mitigar (admin, analista)',
    description:
      'EN_MITIGACION → MITIGADA. Registra la acción aplicada y la fecha de cierre.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Estado no permitido.',
  })
  @Roles('admin', 'analista')
  @Patch(':id/mitigar')
  mitigar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MitigarVulnerabilidadDto,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.mitigar(id, dto);
  }

  @ApiOperation({
    summary: 'Aceptar el riesgo (solo admin)',
    description:
      'ABIERTA o EN_MITIGACION → ACEPTADA. Decisión de gestión: exige justificación.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Estado no permitido.',
  })
  @Roles('admin')
  @Patch(':id/aceptar-riesgo')
  aceptarRiesgo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AceptarRiesgoDto,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.aceptarRiesgo(id, dto);
  }

  @ApiOperation({
    summary: 'Editar (admin, analista)',
    description: 'Corrige CVE, descripción, nivel de riesgo o fechas. Solo mientras está pendiente.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ya está cerrada, o el activo ya tiene ese CVE pendiente.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarVulnerabilidadDto,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar (solo admin)',
    description:
      'Borrado definitivo de la vulnerabilidad, en cualquier estado. No afecta al activo ni a su historial.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.vulnerabilidades.remove(id);
  }
}
