import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType, IntersectionType } from '@nestjs/swagger';
import { MotivoCambioDto } from '../../../audit/dto/traza.dto.js';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
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
import {
  EstadoEquipo,
  TipoMantenimiento,
} from '../../../generated/prisma/enums.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

/** Programar: crea el mantenimiento en fase PROGRAMADO. */
export class ProgramarMantenimientoDto {
  @ApiProperty({ example: 5, description: 'ID de un activo vigente.' })
  @IsInt()
  @Min(1)
  activoId: number;

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
    description: 'Fecha programada (puede ser futura).',
  })
  @Type(() => Date)
  @IsDate()
  fecha: Date;
}

/** Edición: tipo, actividad y fecha programada; solo mientras está PROGRAMADO. */
/** Toda edición exige motivo: se conserva la versión anterior. */
export class EditarMantenimientoDto extends IntersectionType(
  PartialType(OmitType(ProgramarMantenimientoDto, ['activoId'] as const)),
  MotivoCambioDto,
) {}

/** Iniciar: PROGRAMADO → EN_EJECUCION. */
export class IniciarMantenimientoDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Si no se envía, se usa la hora actual del servidor.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaInicio no puede estar en el futuro',
  })
  fechaInicio?: Date;

  @ApiPropertyOptional({ example: 'jperez', description: 'Técnico que realiza el trabajo.' })
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
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  resultado: string;

  @ApiProperty({
    enum: EstadoEquipo,
    example: 'OPERATIVO',
    description: 'Cómo quedó el equipo tras el mantenimiento.',
  })
  @IsEnum(EstadoEquipo)
  estadoEquipo: EstadoEquipo;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Si no se envía, se usa la hora actual del servidor.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaFin no puede estar en el futuro',
  })
  fechaFin?: Date;

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

  @ApiPropertyOptional({ example: 'Informe técnico MT-031', description: 'Referencia a la evidencia.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;
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
