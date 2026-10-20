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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import type { Paginated } from '../../common/dto/paginated-response.dto.js';
import {
  NotificacionDto,
  PaginatedNotificacionDto,
  QueryNotificacionesDto,
  ResumenNotificacionesDto,
} from './dto/notificacion.dto.js';
import {
  EstadoSincronizacionDto,
  ResultadoSincronizacionDto,
  SincronizarDto,
} from './dto/sincronizacion.dto.js';
import { GlpiSyncService } from './glpi-sync.service.js';
import { NotificacionesService } from './notificaciones.service.js';

@ApiTags('glpi')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('glpi/sincronizacion')
export class GlpiSyncController {
  constructor(private readonly glpi: GlpiSyncService) {}

  @ApiOperation({
    summary: 'Estado de la sincronización con GLPI',
    description: 'Si hay una en curso y cuándo fue la última sin errores.',
  })
  @ApiOkResponse({ type: EstadoSincronizacionDto })
  @Get()
  estado(): Promise<EstadoSincronizacionDto> {
    return this.glpi.estado();
  }

  @ApiOperation({
    summary: 'Sincronizar ahora con GLPI (admin, analista)',
    description:
      'Trae de GLPI lo modificado desde la última sincronización y lo aplica. ' +
      'Se ejecuta en el servidor: las credenciales de GLPI no salen de él. ' +
      'Responde cuando termina, con el resumen de lo ocurrido.',
  })
  @ApiOkResponse({ type: ResultadoSincronizacionDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Ya hay una sincronización en curso, o la base no admite escribir.',
  })
  @ApiServiceUnavailableResponse({
    type: ApiErrorDto,
    description: 'GLPI no está configurado en el servidor.',
  })
  @Roles('admin', 'analista')
  @HttpCode(HttpStatus.OK)
  @Post()
  sincronizar(
    @Body() dto: SincronizarDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<ResultadoSincronizacionDto> {
    return this.glpi.sincronizar(usuario, dto.completa);
  }
}

@ApiTags('notificaciones')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @ApiOperation({ summary: 'Avisos de la sincronización, del más reciente al más antiguo' })
  @ApiOkResponse({ type: PaginatedNotificacionDto })
  @Get()
  findAll(
    @Query() query: QueryNotificacionesDto,
  ): Promise<Paginated<NotificacionDto>> {
    return this.notificaciones.findAll(query);
  }

  @ApiOperation({ summary: 'Cuántos avisos quedan sin leer' })
  @ApiOkResponse({ type: ResumenNotificacionesDto })
  @Get('resumen')
  async resumen(): Promise<ResumenNotificacionesDto> {
    return { noLeidas: await this.notificaciones.noLeidas() };
  }

  @ApiOperation({ summary: 'Marcar todos los avisos como leídos (admin, analista)' })
  @ApiNoContentResponse()
  @Roles('admin', 'analista')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('marcar-leidas')
  marcarTodas(): Promise<void> {
    return this.notificaciones.marcarTodasLeidas();
  }

  @ApiOperation({ summary: 'Marcar un aviso como leído (admin, analista)' })
  @ApiOkResponse({ type: NotificacionDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @Roles('admin', 'analista')
  @Patch(':id/leida')
  marcarLeida(@Param('id', ParseIntPipe) id: number): Promise<NotificacionDto> {
    return this.notificaciones.marcarLeida(id);
  }
}
