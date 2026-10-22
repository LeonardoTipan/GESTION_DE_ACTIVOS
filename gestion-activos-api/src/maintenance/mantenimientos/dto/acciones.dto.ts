import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
} from '@nestjs/swagger';
import { MotivoCambioDto } from '../../../audit/dto/traza.dto.js';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxDate,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { AmpliarPlazoDto } from '../../../common/dto/agenda.dto.js';
import {
  EstadoEquipo,
  TipoMantenimiento,
} from '../../../generated/prisma/enums.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

/** Datos PREVISTOS de una ejecución (los copia de su planificación al crearla). */
export class DatosPrevistosEjecucionDto {
  @ApiProperty({ enum: TipoMantenimiento, example: 'PREVENTIVO' })
  @IsEnum(TipoMantenimiento)
  tipo: TipoMantenimiento;

  @ApiProperty({
    example: 'Limpieza interna y actualización de firmware',
    maxLength: 191,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  actividad: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-15T08:00:00.000Z',
    description: 'Inicio previsto de esta ejecución (puede ser futuro).',
  })
  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-17T18:00:00.000Z',
    description: 'Límite previsto para completarla: no anterior al inicio previsto.',
  })
  @Type(() => Date)
  @IsDate()
  fechaLimite: Date;
}

/**
 * Nueva EJECUCIÓN (situación Pendiente) de una planificación existente. El activo,
 * el tipo y la descripción prevista salen de la planificación: la ejecución no se
 * puede asociar a otra planificación ni a otro activo.
 */
export class ProgramarMantenimientoDto {
  @ApiProperty({ example: 3, description: 'Planificación (vigente) que origina la ejecución.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId: number;

  @ApiPropertyOptional({ example: 5, description: 'Si se envía, debe ser el activo de la planificación.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Inicio previsto de esta ejecución.' })
  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Límite previsto; por defecto, inicio + plazo de la planificación.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaLimite?: Date;
}

/** Edición de lo previsto (tipo, actividad, fechas previstas); solo mientras está Pendiente. Exige motivo. */
export class EditarMantenimientoDto extends IntersectionType(PartialType(DatosPrevistosEjecucionDto), MotivoCambioDto) {}

/**
 * Corrección de lo EJECUTADO por un usuario autorizado (p. ej. se registra días
 * después): fechas reales, persona encargada, descripción, observación,
 * verificable y, con justificación, el tipo realmente ejecutado. En ejecución:
 * admin y analista; completada: solo admin. Exige motivo y queda auditada.
 */
export class CorregirEjecucionDto extends MotivoCambioDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha REAL de mantenimiento.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaInicio?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha REAL de finalización (solo en una completada).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaFin?: Date;

  @ApiPropertyOptional({ description: 'Persona encargada.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  tecnico?: string;

  @ApiPropertyOptional({ enum: TipoMantenimiento, description: 'Tipo realmente ejecutado, si difiere del previsto (validado por la clase del activo).' })
  @IsOptional()
  @IsEnum(TipoMantenimiento)
  tipo?: TipoMantenimiento;

  @ApiPropertyOptional({ maxLength: 191, description: 'Descripción de la ejecución (solo en una completada).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  resultado?: string;

  @ApiPropertyOptional({ enum: EstadoEquipo, description: 'Condición del equipo (solo en una completada).' })
  @IsOptional()
  @IsEnum(EstadoEquipo)
  estadoEquipo?: EstadoEquipo;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @ApiPropertyOptional({ description: 'Verificable.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ description: 'Repositorio del verificable.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;
}

/** Iniciar: PROGRAMADO → EN_EJECUCION. */
export class IniciarMantenimientoDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha REAL de mantenimiento: cuándo empezó efectivamente el trabajo (obligatoria; puede ser anterior al registro; no futura).',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaInicio no puede estar en el futuro',
  })
  fechaInicio: Date;

  @ApiPropertyOptional({
    description: 'Si la fecha real cae fuera del intervalo previsto: justificación de la excepción (solo admin, mínimo 20 caracteres).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoExcepcion?: string;

  @ApiPropertyOptional({ example: 'jperez', description: 'Persona encargada que realiza el trabajo.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  tecnico?: string;
}

/** Finalizar: EN_EJECUCION → FINALIZADO. */
export class FinalizarMantenimientoDto {
  @ApiProperty({
    example: 'Firmware actualizado a v2.4; sin incidencias.',
    maxLength: 191,
    description: 'Descripción de la EJECUCIÓN: el trabajo realmente realizado (no sustituye a la planificada).',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  resultado: string;

  @ApiProperty({
    enum: EstadoEquipo,
    example: 'OPERATIVO',
    description: 'Condición del equipo tras el mantenimiento (Operativo / Requiere cambio…). No es la situación de la ejecución.',
  })
  @IsEnum(EstadoEquipo)
  estadoEquipo: EstadoEquipo;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha REAL de finalización (obligatoria; no anterior a la fecha real de mantenimiento; no futura).',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaFin no puede estar en el futuro',
  })
  fechaFin: Date;

  @ApiPropertyOptional({
    example: 'jperez',
    description: 'Técnico. Obligatorio si no se indicó al iniciar.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  tecnico?: string;

  @ApiProperty({ example: 'Ventilador del procesador obstruido; temperatura elevada.' })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  diagnostico: string;

  @ApiProperty({ example: 90, description: 'Duración del trabajo, en minutos.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  duracionMin: number;

  @ApiPropertyOptional({ example: 45.5, description: 'Costo del trabajo y repuestos.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  costo?: number;

  @ApiPropertyOptional({ example: 'Pasta térmica; ventilador 80 mm.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  repuestos?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @ApiPropertyOptional({ example: 'Informe de Mantenimiento a Servidores y Servicios 01', description: 'VERIFICABLE: nombre del informe o documento que prueba la ejecución.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ example: 'Carpeta Compartida TICs/Interno', description: 'REPOSITORIO del verificable: carpeta compartida o URL http(s).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({
    description: 'Si la fecha real cae fuera del intervalo previsto: justificación de la excepción (solo admin, mínimo 20 caracteres).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoExcepcion?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Capa 3: inicio previsto de la verificación (no anterior al fin).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  verificacionPrevista?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Capa 3: límite previsto de la verificación.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  verificacionLimite?: Date;
}

/** Ampliación formal del plazo de la ejecución o de la verificación (solo admin). */
export class AmpliarPlazoMantenimientoDto extends AmpliarPlazoDto {
  @ApiProperty({ enum: ['EJECUCION', 'VERIFICACION'] })
  @IsIn(['EJECUCION', 'VERIFICACION'])
  campo: 'EJECUCION' | 'VERIFICACION';
}

/** Cancelar: PROGRAMADO o EN_EJECUCION → CANCELADO. */
export class CancelarMantenimientoDto {
  @ApiProperty({
    example: 'El proveedor reprogramó la visita.',
    maxLength: 191,
    description: 'Motivo de la cancelación (se guarda como resultado).',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  motivo: string;
}
