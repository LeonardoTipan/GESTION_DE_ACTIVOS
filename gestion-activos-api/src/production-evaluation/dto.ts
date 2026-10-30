import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ActivoBreveDto, RegistroDto, aBooleano } from '../common/dto/registro.dto.js';
import { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';
import { SITUACIONES, type Situacion } from './reglas.js';

/** Fase 1 · planificación. Los datos de la fase 2 van en DatosEjecucionEvaluacionDto. */
export class PlanificarEvaluacionDto {
  @ApiProperty({ description: 'Sistema: activo operativo de una categoría con aplicaEvaluacion.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha y hora PROGRAMADAS para el paso a producción (puede ser futura). No es la fecha de solicitud.',
  })
  @Type(() => Date)
  @IsDate()
  fechaProgramadaProduccion: Date;

  @ApiProperty({ example: 'Seguridad TIC', description: '«Asignado»: quién realiza la evaluación.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ example: 'Módulo de nómina v2.1: pruebas de autenticación, autorización e inyección.', description: '«Descripción planificada».' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  descripcion: string;
}

/**
 * Fase 2 · ejecución y cierre. Todo opcional al guardar avance; al cerrar se exigen la fecha
 * real de las pruebas, el informe (verificable) y su repositorio, y la observación si las
 * pruebas fueron posteriores a la fecha programada. Sin campo «resultado»: el veredicto vive
 * en el informe y en la observación.
 */
export class DatosEjecucionEvaluacionDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha y hora REALES de las pruebas de seguridad: las indica el usuario (pueden ser históricas; no futuras).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaPruebas?: Date;

  @ApiPropertyOptional({ example: 'Informe de pruebas de seguridad nómina v2.1.pdf', description: '«Verificable»: informe de las pruebas.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ example: 'Carpeta Compartida TICs/Seguridad', description: '«Repositorio Verificable»: carpeta o URL http(s).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({
    example: 'Aprobado con observaciones menores; el proveedor entregó la versión dos días tarde.',
    description: 'Observaciones. Obligatoria (≥ 20 caracteres) al cerrar si las pruebas fueron posteriores a la fecha programada.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  observacion?: string;
}

export class ReabrirEvaluacionDto {
  @ApiProperty({ example: 'El informe adjunto correspondía a otra versión del sistema.' })
  @Trim()
  @IsString()
  @MinLength(20, { message: 'El motivo debe tener al menos 20 caracteres.' })
  @MaxLength(2000)
  motivo: string;
}

export class QueryEvaluacionesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Código o nombre del sistema, o la descripción.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: '«Sistema».' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ description: '«Asignado» (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  responsable?: string;

  @ApiPropertyOptional({ enum: EstadoEvaluacionSistema })
  @IsOptional()
  @IsEnum(EstadoEvaluacionSistema)
  estado?: EstadoEvaluacionSistema;

  @ApiPropertyOptional({ description: 'true = solo pendientes (ABIERTO o EN_PROGRESO).' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  pendientes?: boolean;

  @ApiPropertyOptional({ description: 'true = pendientes cuya fecha programada ya pasó.' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  vencidas?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha programada desde.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha programada hasta.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;

  @ApiPropertyOptional({ default: false, description: 'true = incluye las anuladas (por defecto se ocultan).' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados?: boolean;
}

export class EvaluacionSistemaDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty({ type: String, format: 'date-time' }) fechaProgramadaProduccion: Date;
  @ApiProperty() responsable: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ enum: EstadoEvaluacionSistema }) estado: EstadoEvaluacionSistema;
  @ApiProperty({ description: 'Pendiente y con la fecha programada ya pasada.' }) vencida: boolean;
  // Fase 2
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha real de las pruebas de seguridad.' })
  fechaPruebas: Date | null;
  @ApiProperty({ type: String, nullable: true, description: '«Verificable»: informe de las pruebas.' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Repositorio Verificable».' }) repositorioVerificable: string | null;
  @ApiProperty({ type: String, nullable: true }) observacion: string | null;
  @ApiProperty({ type: String, nullable: true }) cerradoPor: string | null;
  @ApiProperty({ description: 'Las pruebas fueron posteriores a la fecha programada de paso a producción.' }) tardia: boolean;
  @ApiProperty({ enum: SITUACIONES, description: 'PENDIENTE / VENCIDA (sin cerrar) · CUMPLIDA / CUMPLIDA_TARDE (cerrada).' })
  situacion: Situacion;
  @ApiProperty({ example: 'S2-2026', description: 'Semestre planificado (fecha programada).' }) semestrePlanificado: string;
  @ApiProperty({ type: String, nullable: true, example: 'S2-2026', description: 'Semestre real (fecha de las pruebas).' })
  semestreReal: string | null;
}

export class PaginatedEvaluacionSistemaDto extends PaginatedResponseDto(EvaluacionSistemaDto) {}

// ── Bitácora (por semestres, con el criterio de la de Mantenimientos) ─────────

export class QueryBitacoraEvaluacionDto {
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

export class PeriodoBitacoraEvaluacionDto {
  @ApiProperty() anio: number;
  @ApiProperty({ enum: [1, 2], nullable: true, description: 'null = el año entero.' }) semestre: 1 | 2 | null;
  @ApiProperty({ example: 'S1-2026' }) etiqueta: string;
}

export class ResumenBitacoraEvaluacionDto {
  @ApiProperty({ type: PeriodoBitacoraEvaluacionDto }) periodo: PeriodoBitacoraEvaluacionDto;
  @ApiProperty({ description: 'Planificadas en el semestre (fecha programada de paso a producción), no anuladas.' }) planificadas: number;
  @ApiProperty({ description: 'De ellas, cerradas.' }) cumplidas: number;
  @ApiProperty({ description: 'Cumplidas con las pruebas en o antes de la fecha programada.' }) cumplidasATiempo: number;
  @ApiProperty({ description: 'Cumplidas con las pruebas después de la fecha programada (justificadas).' }) cumplidasTarde: number;
  @ApiProperty({ description: 'planificadas − cumplidas.' }) pendientes: number;
  @ApiProperty({ description: 'De las pendientes, con la fecha programada ya pasada.' }) vencidas: number;
  @ApiProperty({ description: 'Cerradas cuyas pruebas fueron en este semestre REAL.' }) cerradasEnElSemestre: number;
  @ApiProperty({ type: Number, nullable: true, description: 'cumplidas / planificadas × 100, 1 decimal; null sin planificadas.' })
  cumplimiento: number | null;
}

export class BitacoraEvaluacionDto {
  @ApiProperty({ type: [ResumenBitacoraEvaluacionDto] }) semestres: ResumenBitacoraEvaluacionDto[];
  @ApiProperty({ type: ResumenBitacoraEvaluacionDto, description: 'Los semestres pedidos en conjunto.' }) total: ResumenBitacoraEvaluacionDto;
}

export class QueryBitacoraEspecificaEvaluacionDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ description: '«Sistema».' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ description: '«Asignado» (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  responsable?: string;

  @ApiPropertyOptional({ enum: SITUACIONES })
  @IsOptional()
  @IsIn(SITUACIONES)
  situacion?: Situacion;
}
