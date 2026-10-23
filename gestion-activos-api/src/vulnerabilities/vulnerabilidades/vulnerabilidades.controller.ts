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
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { EventoAgendaDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import { IndicadorDto, periodoOTrimestre } from '../../common/indicadores/indicador.js';
import { QueryPeriodoIndicadoresDto } from '../../common/indicadores/periodo.dto.js';
import {
  ActualizarRemediacionDto,
  EditarVulnerabilidadDto,
  IniciarRemediacionDto,
  ReabrirDto,
  RegistrarLoteDto,
  RegistrarVulnerabilidadDto,
  RemediarDto,
} from './dto/acciones.dto.js';
import { QueryVulnerabilidadesDto } from './dto/query-vulnerabilidades.dto.js';
import { PaginatedVulnerabilidadDto, VulnerabilidadDto } from './dto/vulnerabilidad.dto.js';
import { VulnerabilidadesService } from './vulnerabilidades.service.js';

/**
 * Vulnerabilidades en dos fases, Detección y Remediación, sobre el mismo registro.
 * Consultar: todos los roles. Registrar y remediar: admin y analista. Las reglas
 * (transiciones, evidencia, fechas) se validan aquí, no en la interfaz.
 */
@ApiTags('vulnerabilidades')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('vulnerabilidades')
export class VulnerabilidadesController {
  constructor(private readonly vulnerabilidades: VulnerabilidadesService) {}

  @ApiOperation({
    summary: 'Listar vulnerabilidades',
    description:
      'Paginado; las más críticas y antiguas primero. Filtros por activo, categoría, criticidad, responsable, ' +
      'estado, rango de fechas de detección, CVE, pendientes, vencidas y sincronización incremental.',
  })
  @ApiOkResponse({ type: PaginatedVulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(@Query() query: QueryVulnerabilidadesDto): Promise<Paginated<VulnerabilidadDto>> {
    return this.vulnerabilidades.findAll(query);
  }

  @ApiOperation({
    summary: 'Indicadores (A.8.8)',
    description: 'Del período indicado (por defecto, el trimestre actual). Las anuladas no cuentan.',
  })
  @ApiOkResponse({ type: [IndicadorDto] })
  @Get('indicadores')
  indicadores(@Query() q: QueryPeriodoIndicadoresDto): Promise<IndicadorDto[]> {
    const { desde, hasta } = periodoOTrimestre(q.desde, q.hasta);
    return this.vulnerabilidades.indicadores(desde, hasta);
  }

  @ApiOperation({
    summary: 'Agenda (calendario)',
    description: 'Capa 1 Detección (detección y plazo) y capa 2 Remediación (pendiente, inicio y remediación reales). No hay capa 3.',
  })
  @ApiOkResponse({ type: [EventoAgendaDto] })
  @Get('agenda')
  agenda(@Query() q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    return this.vulnerabilidades.agenda(q);
  }

  @ApiOperation({ summary: 'Detalle de una vulnerabilidad' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.findOne(id);
  }

  // ── Fase 1 · Detección ──

  @ApiOperation({
    summary: 'Detección: registrar (admin, analista)',
    description: 'Crea la vulnerabilidad en estado ABIERTO sobre un activo operativo de GLPI. No exige datos de remediación.',
  })
  @ApiCreatedResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Datos inválidos o activo inexistente/no operativo.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'El activo ya tiene ese CVE pendiente.' })
  @Roles('admin', 'analista')
  @Post()
  registrar(@Body() dto: RegistrarVulnerabilidadDto, @CurrentUser() usuario: AuthUser): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.registrar(dto, usuario);
  }

  @ApiOperation({ summary: 'Detección: la misma vulnerabilidad en varios activos (admin, analista)', description: 'Un registro por activo, o ninguno.' })
  @ApiCreatedResponse({ type: [VulnerabilidadDto] })
  @Roles('admin', 'analista')
  @Post('lote')
  registrarLote(@Body() dto: RegistrarLoteDto, @CurrentUser() usuario: AuthUser): Promise<VulnerabilidadDto[]> {
    return this.vulnerabilidades.registrarLote(dto, usuario);
  }

  @ApiOperation({
    summary: 'Detección: corregir con motivo (admin, analista)',
    description: 'Fecha de detección, descripción, criticidad, responsable, CVE y plazo, mientras está pendiente. Queda en la auditoría.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Remediada, anulada o modificada entretanto.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarVulnerabilidadDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.update(id, dto, usuario);
  }

  // ── Fase 2 · Remediación ──

  @ApiOperation({ summary: 'Remediación: iniciar (admin, analista)', description: 'ABIERTO → EN_PROGRESO.' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/iniciar')
  iniciar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IniciarRemediacionDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.iniciar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Remediación: guardar o corregir sus datos (admin, analista; remediada: solo admin con motivo)',
    description: 'Fecha real de remediación, verificable, repositorio y observación. No cambia el estado.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Patch(':id/remediacion')
  actualizarRemediacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarRemediacionDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.actualizarRemediacion(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Remediación: marcar REMEDIADO (admin, analista)',
    description: 'ABIERTO o EN_PROGRESO → REMEDIADO. Exige la fecha REAL de remediación (manual), el verificable y su repositorio.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Falta la fecha o la evidencia, o la fecha no es válida.' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Estado no permitido.' })
  @Roles('admin', 'analista')
  @Patch(':id/remediar')
  remediar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemediarDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.remediar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Remediación: reabrir (admin, analista)',
    description: 'REMEDIADO → EN_PROGRESO, con motivo. La fecha de remediación anterior queda en la auditoría.',
  })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'No está remediada.' })
  @Roles('admin', 'analista')
  @Patch(':id/reabrir')
  reabrir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReabrirDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    return this.vulnerabilidades.reabrir(id, dto, usuario);
  }

  // ── Registro ──

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
