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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MotivoDto } from '../../audit/dto/traza.dto.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { VulnerabilidadDto } from '../vulnerabilidades/dto/vulnerabilidad.dto.js';
import {
  AccionRemediacionDto,
  EvaluarVulnerabilidadDto,
  RegistrarAccionDto,
  RegistrarLoteDto,
  RegistrarVerificacionVulnerabilidadDto,
  VerificacionVulnerabilidadDto,
} from './dto.js';
import { TratamientoVulnerabilidadService } from './tratamiento.service.js';

@ApiTags('vulnerabilidades')
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Token ausente o inválido.' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Rol insuficiente.' })
@ApiConflictResponse({ type: ApiErrorDto, description: 'Estado o etapa no permitidos.' })
@Controller('vulnerabilidades')
export class TratamientoVulnerabilidadController {
  constructor(private readonly tratamiento: TratamientoVulnerabilidadService) {}

  @ApiOperation({ summary: 'Capa 1 · Registrar la misma vulnerabilidad en varios activos (admin, analista)' })
  @ApiCreatedResponse({ type: [VulnerabilidadDto] })
  @Roles('admin', 'analista')
  @Post('lote')
  lote(@Body() dto: RegistrarLoteDto, @CurrentUser() u: AuthUser): Promise<VulnerabilidadDto[]> {
    return this.tratamiento.registrarLote(dto, u);
  }

  @ApiOperation({ summary: 'Capa 1 · Confirmar una vulnerabilidad detectada (admin, analista)' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @Roles('admin', 'analista')
  @Patch(':id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser): Promise<VulnerabilidadDto> {
    return this.tratamiento.confirmar(id, u);
  }

  @ApiOperation({ summary: 'Capa 2 · Evaluar: prioridad, responsable y plan de remediación (admin, analista)' })
  @ApiOkResponse({ type: VulnerabilidadDto })
  @Roles('admin', 'analista')
  @Patch(':id/evaluar')
  evaluar(@Param('id', ParseIntPipe) id: number, @Body() dto: EvaluarVulnerabilidadDto, @CurrentUser() u: AuthUser) {
    return this.tratamiento.evaluar(id, dto, u);
  }

  @ApiOperation({ summary: 'Capa 2 · Acciones correctivas' })
  @ApiOkResponse({ type: [AccionRemediacionDto] })
  @Get(':id/acciones')
  acciones(@Param('id', ParseIntPipe) id: number): Promise<AccionRemediacionDto[]> {
    return this.tratamiento.listarAcciones(id);
  }

  @ApiOperation({ summary: 'Registrar una acción correctiva (admin, analista)', description: 'Con la vulnerabilidad EN_MITIGACION.' })
  @ApiCreatedResponse({ type: AccionRemediacionDto })
  @Roles('admin', 'analista')
  @Post(':id/acciones')
  registrarAccion(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarAccionDto, @CurrentUser() u: AuthUser) {
    return this.tratamiento.registrarAccion(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular una acción correctiva (admin)' })
  @ApiOkResponse({ type: AccionRemediacionDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('acciones/:id/anular')
  anularAccion(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.tratamiento.anularAccion(id, dto.motivo, u);
  }

  @ApiOperation({ summary: 'Capa 3 · Verificaciones' })
  @ApiOkResponse({ type: [VerificacionVulnerabilidadDto] })
  @Get(':id/verificaciones')
  verificaciones(@Param('id', ParseIntPipe) id: number): Promise<VerificacionVulnerabilidadDto[]> {
    return this.tratamiento.listarVerificaciones(id);
  }

  @ApiOperation({
    summary: 'Registrar la verificación posterior (admin, analista)',
    description:
      'CORREGIDA cierra la vulnerabilidad (exige al menos una acción correctiva) y registra quién la cerró. PERSISTE la mantiene en tratamiento o, si estaba cerrada, la reabre.',
  })
  @ApiCreatedResponse({ type: VerificacionVulnerabilidadDto })
  @Roles('admin', 'analista')
  @Post(':id/verificaciones')
  verificar(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarVerificacionVulnerabilidadDto, @CurrentUser() u: AuthUser) {
    return this.tratamiento.verificar(id, dto, u);
  }

  @ApiOperation({ summary: 'Anular una verificación (admin)' })
  @ApiOkResponse({ type: VerificacionVulnerabilidadDto })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('verificaciones/:id/anular')
  anularVerificacion(@Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @CurrentUser() u: AuthUser) {
    return this.tratamiento.anularVerificacion(id, dto.motivo, u);
  }
}
