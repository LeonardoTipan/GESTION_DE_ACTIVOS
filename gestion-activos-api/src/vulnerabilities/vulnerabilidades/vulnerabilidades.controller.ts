import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MotivoDto } from '../../audit/dto/traza.dto.js';
import { QueryPeriodoIndicadoresDto } from '../../common/indicadores/periodo.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { IndicadorDto, periodoOTrimestre } from '../../common/indicadores/indicador.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  AceptarRiesgoDto,
  EditarVulnerabilidadDto,
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

  @ApiOperation({
    summary: 'Indicadores (A.8.8)',
    description: 'Del período indicado (por defecto, el trimestre actual). Los anulados no cuentan.',
  })
  @ApiOkResponse({ type: [IndicadorDto] })
  @Get('indicadores')
  indicadores(@Query() q: QueryPeriodoIndicadoresDto): Promise<IndicadorDto[]> {
    const { desde, hasta } = periodoOTrimestre(q.desde, q.hasta);
    return this.vulnerabilidades.indicadores(desde, hasta);
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
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.registrar(dto, usuario);
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
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.aceptarRiesgo(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Editar con motivo (admin, analista)',
    description: 'Corrige los datos mientras está pendiente. Exige motivoCambio: sube la versión y conserva la anterior.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Cerrado, anulado o modificado entretanto.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarVulnerabilidadDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.update(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Anular (eliminación lógica, solo admin)',
    description: 'No se borra: queda marcado, con su motivo, y deja de contar en los indicadores.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ya estaba anulado.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.anular(id, dto.motivo, usuario);
  }

  @ApiOperation({ summary: 'Revertir la anulación (solo admin)' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'No estaba anulado.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.reversar(id, dto.motivo, usuario);
  }
}
