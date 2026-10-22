import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ActivoBreveDto } from '../../common/dto/registro.dto.js';
import {
  EstadoEquipo,
  FaseMantenimiento,
  FrecuenciaMantenimiento,
  TipoMantenimiento,
} from '../../generated/prisma/enums.js';
import { SemestreDto } from '../planes/dto.js';

// ── Bitácora General ────────────────────────────────────────────────────────

export class QueryBitacoraGeneralDto {
  @ApiProperty({ minimum: 2000, maximum: 2100, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ enum: [1, 2], description: 'S1 (ene–jun) o S2 (jul–dic); sin él, los dos y el total del año.' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  semestre?: 1 | 2;
}

export class PeriodoBitacoraDto {
  @ApiProperty() anio: number;
  @ApiProperty({ enum: [1, 2], nullable: true, description: 'null = el año entero.' }) semestre: 1 | 2 | null;
  @ApiProperty({ example: 'S1-2026' }) etiqueta: string;
}

export class ResumenBitacoraDto {
  @ApiProperty({ type: PeriodoBitacoraDto }) periodo: PeriodoBitacoraDto;
  @ApiProperty({ description: 'Planificaciones del semestre PLANIFICADO (fecha de inicio planificada), no anuladas.' })
  planificadas: number;
  @ApiProperty({ description: 'Suspendidas sin ejecución completada: no exigibles, fuera del cálculo.' })
  suspendidas: number;
  @ApiProperty({ description: 'planificadas − suspendidas (denominador del cumplimiento).' })
  esperadas: number;
  @ApiProperty({ description: 'Planificaciones con al menos una ejecución completada (sin doble conteo).' })
  cumplidas: number;
  @ApiProperty({ description: 'esperadas − cumplidas.' })
  pendientes: number;
  @ApiProperty({ description: 'Ejecuciones completadas en este semestre REAL (fecha real de mantenimiento).' })
  ejecucionesCompletadas: number;
  @ApiProperty({ description: 'De ellas, sin planificación (registros anteriores).' })
  ejecucionesSinPlanificacion: number;
  @ApiProperty({ type: Number, nullable: true, description: 'cumplidas / esperadas × 100, con 1 decimal; null si no hay esperadas.' })
  cumplimiento: number | null;
}

export class BitacoraGeneralDto {
  @ApiProperty({ type: [ResumenBitacoraDto] }) semestres: ResumenBitacoraDto[];
  @ApiProperty({ type: ResumenBitacoraDto, description: 'Suma de los semestres pedidos.' }) total: ResumenBitacoraDto;
}

// ── Bitácora Específica ─────────────────────────────────────────────────────

/** Situación de una fila: la de la ejecución, o SIN_EJECUCION (planificación aún sin ejecuciones). */
export const SITUACIONES_BITACORA = [...Object.values(FaseMantenimiento), 'SIN_EJECUCION'] as const;
export type SituacionBitacora = (typeof SITUACIONES_BITACORA)[number];

export class QueryBitacoraEspecificaDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100, description: 'Año planificado.' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ enum: TipoMantenimiento })
  @IsOptional()
  @IsEnum(TipoMantenimiento)
  tipo?: TipoMantenimiento;

  @ApiPropertyOptional({ description: 'Asignado o persona encargada (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  responsable?: string;

  @ApiPropertyOptional({
    enum: SITUACIONES_BITACORA,
    description: 'Situación. PROGRAMADO (Pendiente) incluye también las planificaciones sin ejecución.',
  })
  @IsOptional()
  @IsIn(SITUACIONES_BITACORA)
  situacion?: SituacionBitacora;
}

export class FilaBitacoraDto {
  @ApiProperty({ example: 'E-12', description: 'E-<ejecución> o P-<planificación sin ejecución>.' }) clave: string;
  @ApiProperty({ type: Number, nullable: true }) mantenimientoId: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'null = registro anterior sin planificación.' }) planId: number | null;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty({ enum: SITUACIONES_BITACORA }) situacion: SituacionBitacora;

  // Planificación
  @ApiProperty({ enum: FrecuenciaMantenimiento, nullable: true, description: 'Período.' }) periodo: FrecuenciaMantenimiento | null;
  @ApiProperty({ type: () => SemestreDto, nullable: true }) semestrePlanificado: SemestreDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fechaInicioPlanificada: Date | null;
  @ApiProperty({ enum: TipoMantenimiento, nullable: true }) tipoPlanificado: TipoMantenimiento | null;
  @ApiProperty({ type: String, nullable: true, description: 'Asignado.' }) asignado: string | null;
  @ApiProperty({ type: String, nullable: true }) descripcionPlanificada: string | null;

  // Ejecución
  @ApiProperty({ enum: TipoMantenimiento, nullable: true, description: 'Tipo de la ejecución.' }) tipo: TipoMantenimiento | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Inicio previsto de la ejecución.' }) fechaPrevista: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fechaLimite: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha REAL de mantenimiento.' }) fechaInicio: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha REAL de finalización.' }) fechaFin: Date | null;
  @ApiProperty({ type: () => SemestreDto, nullable: true }) semestreReal: SemestreDto | null;
  @ApiProperty({ type: String, nullable: true, description: 'Persona encargada.' }) tecnico: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Descripción de la ejecución o motivo de cancelación.' }) resultado: string | null;
  @ApiProperty({ enum: EstadoEquipo, nullable: true, description: 'Condición del equipo.' }) estadoEquipo: EstadoEquipo | null;
  @ApiProperty({ type: String, nullable: true }) observaciones: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Verificable.' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true }) repositorioVerificable: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fechaCancelacion: Date | null;
  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro (de la ejecución, o de la planificación si no tiene).' })
  registradoEn: Date;
}

export class PaginatedFilaBitacoraDto extends PaginatedResponseDto(FilaBitacoraDto) {}
