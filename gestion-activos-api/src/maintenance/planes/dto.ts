import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import {
  aBooleano,
  ActivoBreveDto,
  MotivoCambioDto,
  QueryRegistrosDto,
  RegistroDto,
} from '../../common/dto/registro.dto.js';
import {
  EstadoPlan,
  FrecuenciaMantenimiento,
  ResultadoVerificacionMantenimiento,
  TipoMantenimiento,
} from '../../generated/prisma/enums.js';

// ── Capa 1 · Planificación ──────────────────────────────────────────────────

export class ParametrosPlanMantenimientoDto {
  @ApiProperty({ enum: TipoMantenimiento })
  @IsEnum(TipoMantenimiento)
  tipo: TipoMantenimiento;

  @ApiProperty({ enum: FrecuenciaMantenimiento, description: 'UNICA = una sola intervención.' })
  @IsEnum(FrecuenciaMantenimiento)
  frecuencia: FrecuenciaMantenimiento;

  @ApiProperty({ type: String, format: 'date-time', description: 'Primera (o próxima) intervención prevista.' })
  @Type(() => Date)
  @IsDate()
  proximaFecha: Date;

  @ApiProperty({ example: 'Mesa de Servicios' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ example: 'Limpieza interna, revisión de ventiladores y actualización de firmware.' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  actividades: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Días de plazo de cada intervención desde su inicio previsto (7 si se omite).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  plazoDias?: number;
}

/** Un plan por cada activo seleccionado, con los mismos parámetros. */
export class CrearPlanesMantenimientoDto extends ParametrosPlanMantenimientoDto {
  @ApiProperty({ type: [Number], example: [5, 8], description: 'Activos operativos sin plan vigente de ese tipo.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos un activo.' })
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  activoIds: number[];
}

export class ModificarPlanMantenimientoDto extends IntersectionType(
  PartialType(ParametrosPlanMantenimientoDto),
  MotivoCambioDto,
) {
  @ApiPropertyOptional({ enum: EstadoPlan })
  @IsOptional()
  @IsEnum(EstadoPlan)
  estado?: EstadoPlan;
}

export class QueryPlanesMantenimientoDto extends QueryRegistrosDto {
  @ApiPropertyOptional({ enum: TipoMantenimiento })
  @IsOptional()
  @IsEnum(TipoMantenimiento)
  tipo?: TipoMantenimiento;

  @ApiPropertyOptional({ enum: EstadoPlan })
  @IsOptional()
  @IsEnum(EstadoPlan)
  estado?: EstadoPlan;

  @ApiPropertyOptional({ description: 'true = solo los vigentes cuya próxima intervención ya pasó.' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  vencidos?: boolean;
}

export class PlanMantenimientoDto extends IntersectionType(
  ParametrosPlanMantenimientoDto,
  RegistroDto,
) {
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty({ enum: EstadoPlan }) estado: EstadoPlan;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'null = sin más intervenciones previstas.' })
  declare proximaFecha: Date;
  @ApiProperty({ description: 'Vigente y con la próxima intervención ya vencida.' }) vencido: boolean;
  @ApiProperty({ description: 'Intervenciones generadas desde el plan.' }) intervenciones: number;
}

export class PaginatedPlanMantenimientoDto extends PaginatedResponseDto(PlanMantenimientoDto) {}

export class ProgramarDesdePlanDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Por defecto, la próxima fecha del plan.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha?: Date;
}

// ── Capa 3 · Verificación y cierre ──────────────────────────────────────────

/** Resultado de programar desde el plan. */
export class ProgramacionDesdePlanDto {
  @ApiProperty({ description: 'Mantenimiento creado (fase PROGRAMADO).' })
  mantenimientoId: number;

  @ApiProperty({ type: () => PlanMantenimientoDto, description: 'El plan, con la próxima fecha ya adelantada.' })
  plan: PlanMantenimientoDto;
}

export class RegistrarVerificacionMantenimientoDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @ApiProperty({
    enum: ResultadoVerificacionMantenimiento,
    description: 'OPERATIVO cierra el mantenimiento; REQUIERE_SEGUIMIENTO lo deja abierto; NO_SATISFACTORIO avisa.',
  })
  @IsEnum(ResultadoVerificacionMantenimiento)
  resultado: ResultadoVerificacionMantenimiento;

  @ApiProperty({ example: 'Equipo encendido 2 h sin incidencias; temperatura normal.' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  observaciones: string;

  @ApiPropertyOptional({ example: 'Acta MT-2026-031', description: 'Obligatoria para cerrar como OPERATIVO.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ description: 'Fuera de la ventana prevista de verificación: justificación (solo admin).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoExcepcion?: string;

  @ApiProperty({ example: 'Mesa de Servicios' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;
}

export class VerificacionMantenimientoDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() mantenimientoId: number;
  @ApiProperty({ type: String, format: 'date-time' }) fecha: Date;
  @ApiProperty({ enum: ResultadoVerificacionMantenimiento }) resultado: ResultadoVerificacionMantenimiento;
  @ApiProperty() observaciones: string;
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;
  @ApiProperty() responsable: string;
  @ApiProperty() registradoPor: string;
  @ApiProperty() fueraDePlazo: boolean;
  @ApiProperty({ type: String, nullable: true }) motivoExcepcion: string | null;
  @ApiProperty({ type: String, nullable: true }) excepcionPor: string | null;
}

// ── Tablero ─────────────────────────────────────────────────────────────────

class ProximaIntervencionDto {
  @ApiProperty({ enum: ['PLAN', 'PROGRAMADO'] }) origen: 'PLAN' | 'PROGRAMADO';
  @ApiProperty() id: number;
  @ApiProperty({ type: String, format: 'date-time' }) fecha: Date;
  @ApiProperty({ enum: TipoMantenimiento }) tipo: TipoMantenimiento;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty() vencido: boolean;
}

export class TableroMantenimientosDto {
  @ApiProperty({ type: [ProximaIntervencionDto], description: 'Próximas intervenciones (60 días) y las vencidas.' })
  proximas: ProximaIntervencionDto[];

  @ApiProperty({ description: 'Activos operativos sin plan preventivo vigente.' })
  activosSinPlan: number;

  @ApiProperty({ type: [ActivoBreveDto], description: 'Hasta 20 de ellos.' })
  ejemplosSinPlan: ActivoBreveDto[];

  @ApiProperty() planesVencidos: number;

  @ApiProperty({ description: 'Finalizados que esperan su verificación.' })
  pendientesVerificacion: number;
}
