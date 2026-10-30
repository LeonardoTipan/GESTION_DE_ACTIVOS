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
  IsIn,
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
  TipoMantenimiento,
} from '../../generated/prisma/enums.js';

// ── Capa 1 · Planificación ──────────────────────────────────────────────────

/** Semestre (S1 ene–jun, S2 jul–dic) y año de una fecha, en la hora de la institución. */
export class SemestreDto {
  @ApiProperty({ example: 2026 }) anio: number;
  @ApiProperty({ enum: [1, 2] }) semestre: 1 | 2;
  @ApiProperty({ example: 'S1-2026' }) etiqueta: string;
}


export class ParametrosPlanMantenimientoDto {
  @ApiProperty({
    enum: TipoMantenimiento,
    description: 'Tipo previsto. Hardware: PREVENTIVO, CORRECTIVO, PREDICTIVO. Software: PREVENTIVO, CORRECTIVO, PERFECTIVO, ADAPTATIVO, EVOLUTIVO (según la clase de la categoría del activo).',
  })
  @IsEnum(TipoMantenimiento)
  tipo: TipoMantenimiento;

  @ApiProperty({ enum: FrecuenciaMantenimiento, description: 'PERÍODO: cada cuánto se planifica (UNICA = una sola intervención).' })
  @IsEnum(FrecuenciaMantenimiento)
  frecuencia: FrecuenciaMantenimiento;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha de inicio PLANIFICADA (fija). De ella salen el semestre (S1 ene–jun, S2 jul–dic) y el año planificados.',
  })
  @Type(() => Date)
  @IsDate()
  fechaInicio: Date;

  @ApiProperty({ example: 'Mesa de Servicios', description: 'Asignado: quién debe realizarlo.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ example: 'Limpieza interna, revisión de ventiladores y actualización de firmware.', description: 'Descripción PLANIFICADA del trabajo.' })
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

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100, description: 'Año planificado (de la fecha de inicio).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({ enum: [1, 2], description: 'Semestre planificado (exige el año).' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  semestre?: 1 | 2;

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
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Próxima intervención, CALCULADA (no se escribe): fin real de la última ejecución finalizada + período; sin ninguna, la fecha de inicio. null = sin más intervenciones (ÚNICA ya ejecutada).',
  })
  proximaFecha: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin REAL de la última ejecución finalizada (no anulada).' })
  ultimaFinalizacion: Date | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Ejecución pendiente (programada o en ejecución) del plan, si la hay.' })
  ejecucionPendienteId: number | null;
  @ApiProperty({ type: () => SemestreDto, description: 'Semestre y año PLANIFICADOS (de la fecha de inicio).' })
  semestrePlanificado: SemestreDto;
  @ApiProperty({ description: 'Ejecuciones COMPLETADAS (finalizadas, no anuladas).' }) ejecucionesCompletadas: number;
  @ApiProperty({ description: 'Vigente y con la próxima intervención ya vencida.' }) vencido: boolean;
  @ApiProperty({ description: 'Intervenciones generadas desde el plan.' }) intervenciones: number;
}

export class PaginatedPlanMantenimientoDto extends PaginatedResponseDto(PlanMantenimientoDto) {}

/**
 * Crea una EJECUCIÓN (situación Pendiente) de la planificación. Nunca mueve la próxima
 * intervención: se recalcula al FINALIZAR, desde el fin real. Una sola ejecución pendiente
 * por plan; una ADICIONAL (trabajo extra, intervención parcial) exige fecha y justificación.
 */
export class ProgramarDesdePlanDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Inicio previsto; por defecto, la próxima intervención del plan. Obligatorio si es adicional.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Límite previsto; por defecto, inicio + plazo del plan.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaLimite?: Date;

  @ApiPropertyOptional({ description: 'true = ejecución adicional (admite otra pendiente del mismo plan): exige fecha y justificación.' })
  @IsOptional()
  @IsBoolean()
  adicional?: boolean;

  @ApiPropertyOptional({ description: 'Justificación de la ejecución adicional (al menos 20 caracteres); queda en la auditoría.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  justificacion?: string;
}

/** Resultado de programar desde el plan. */
export class ProgramacionDesdePlanDto {
  @ApiProperty({ description: 'Mantenimiento creado (fase PROGRAMADO).' })
  mantenimientoId: number;

  @ApiProperty({ type: () => PlanMantenimientoDto, description: 'El plan (su próxima intervención no cambia al programar).' })
  plan: PlanMantenimientoDto;
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
}
