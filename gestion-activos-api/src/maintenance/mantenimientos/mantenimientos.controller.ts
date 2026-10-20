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
import { ProgramarVerificacionDto } from '../../common/dto/agenda.dto.js';
import {
  AmpliarPlazoMantenimientoDto,
  CancelarMantenimientoDto,
  EditarMantenimientoDto,
  FinalizarMantenimientoDto,
  IniciarMantenimientoDto,
  ProgramarMantenimientoDto,
} from './dto/acciones.dto.js';
import {
  MantenimientoDto,
  PaginatedMantenimientoDto,
} from './dto/mantenimiento.dto.js';
import { QueryMantenimientosDto } from './dto/query-mantenimientos.dto.js';
import { MantenimientosService } from './mantenimientos.service.js';

@ApiTags('mantenimientos')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'Token ausente o inválido.',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('mantenimientos')
export class MantenimientosController {
  constructor(private readonly mantenimientos: MantenimientosService) {}

  @ApiOperation({
    summary: 'Listar mantenimientos',
    description:
      'Paginado por fecha programada. Filtros por activo, tipo, fase, estado del equipo, ' +
      'rango de fechas (calendario), vencidos y sincronización incremental.',
  })
  @ApiOkResponse({ type: PaginatedMantenimientoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @Get()
  findAll(
    @Query() query: QueryMantenimientosDto,
  ): Promise<Paginated<MantenimientoDto>> {
    return this.mantenimientos.findAll(query);
  }

  @ApiOperation({
    summary: 'Indicadores (A.7.13)',
    description: 'Del período indicado (por defecto, el trimestre actual). Los anulados no cuentan.',
  })
  @ApiOkResponse({ type: [IndicadorDto] })
  @Get('indicadores')
  indicadores(@Query() q: QueryPeriodoIndicadoresDto): Promise<IndicadorDto[]> {
    const { desde, hasta } = periodoOTrimestre(q.desde, q.hasta);
    return this.mantenimientos.indicadores(desde, hasta);
  }

  @ApiOperation({ summary: 'Detalle de un mantenimiento' })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<MantenimientoDto> {
    return this.mantenimientos.findOne(id);
  }

  @ApiOperation({
    summary: 'Programar mantenimiento (admin, analista)',
    description: 'Crea el mantenimiento en fase PROGRAMADO.',
  })
  @ApiCreatedResponse({ type: MantenimientoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o activo inexistente/dado de baja.',
  })
  @Roles('admin', 'analista')
  @Post()
  programar(@Body() dto: ProgramarMantenimientoDto): Promise<MantenimientoDto> {
    return this.mantenimientos.programar(dto);
  }

  @ApiOperation({
    summary: 'Iniciar (admin, analista)',
    description: 'PROGRAMADO → EN_EJECUCION.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/iniciar')
  iniciar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IniciarMantenimientoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.iniciar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Ampliar el plazo (solo admin)',
    description: 'Amplía formalmente el límite de la ejecución o de la verificación, con motivo. Se conserva el límite original y queda la traza.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @Roles('admin')
  @Patch(':id/plazo')
  ampliarPlazo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmpliarPlazoMantenimientoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.ampliarPlazo(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Programar la verificación (admin, analista)',
    description: 'Capa 3: ventana prevista [prevista, límite] para verificar un mantenimiento finalizado. Tiene su propio plazo.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @Roles('admin', 'analista')
  @Patch(':id/verificacion-prevista')
  programarVerificacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProgramarVerificacionDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.programarVerificacion(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Finalizar (admin, analista)',
    description:
      'EN_EJECUCION → FINALIZADO. Registra resultado y estado del equipo.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Datos inválidos o fecha de fin anterior al inicio.',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/finalizar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarMantenimientoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.finalizar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Cancelar (admin, analista)',
    description: 'PROGRAMADO o EN_EJECUCION → CANCELADO, con motivo.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Fase no permitida.' })
  @Roles('admin', 'analista')
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.cancelar(id, dto);
  }

  @ApiOperation({
    summary: 'Editar con motivo (admin, analista)',
    description: 'Cambia tipo, actividad o fecha programada. Solo en fase PROGRAMADO. Exige motivoCambio: sube la versión y conserva la anterior.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Cerrado, anulado o modificado entretanto.' })
  @Roles('admin', 'analista')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarMantenimientoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.update(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Anular (eliminación lógica, solo admin)',
    description: 'No se borra: queda marcado, con su motivo, y deja de contar en los indicadores.',
  })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Ya estaba anulado.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.anular(id, dto.motivo, usuario);
  }

  @ApiOperation({ summary: 'Revertir la anulación (solo admin)' })
  @ApiOkResponse({ type: MantenimientoDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'No estaba anulado.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reversar')
  reversar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    return this.mantenimientos.reversar(id, dto.motivo, usuario);
  }
}
