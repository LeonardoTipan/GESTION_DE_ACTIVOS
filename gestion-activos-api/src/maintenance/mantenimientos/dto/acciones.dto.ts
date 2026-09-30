import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxDate,
  MaxLength,
  Min,
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
