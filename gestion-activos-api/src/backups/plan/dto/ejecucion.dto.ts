import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import {
  MedioRespaldo,
  MotivoRestauracion,
  ResultadoOperacion,
  TipoRespaldo,
} from '../../../generated/prisma/enums.js';
import {
  ActivoBreveDto,
  MotivoCambioDto,
  QueryPeriodoDto,
  RegistroDto,
} from './comun.dto.js';

// ── Paso 2 · Ejecución del respaldo ─────────────────────────────────────────

export class RegistrarEjecucionDto {
  @ApiProperty({ example: 3, description: 'Plan VIGENTE del activo respaldado.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId: number;

  @ApiProperty({ type: String, format: 'date', description: 'No puede ser futura.' })
  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @ApiProperty({ enum: TipoRespaldo })
  @IsEnum(TipoRespaldo)
  tipo: TipoRespaldo;

  @ApiProperty({ enum: MedioRespaldo })
  @IsEnum(MedioRespaldo)
  medio: MedioRespaldo;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  volumenGb: number;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  duracionMin: number;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  rpoHoras: number;

  @ApiProperty({ enum: ResultadoOperacion })
  @IsEnum(ResultadoOperacion)
  resultado: ResultadoOperacion;

  @ApiProperty({ example: 'Coordinación de Infraestructura' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ description: 'Cifrado (A.8.24).' })
  @IsBoolean()
  cifrado: boolean;

  @ApiProperty({ description: 'Copia fuera de sitio.' })
  @IsBoolean()
  fueraSitio: boolean;

  @ApiProperty({ description: 'Retención inmutable.' })
  @IsBoolean()
  inmutable: boolean;

  @ApiProperty({ description: 'Integridad verificada.' })
  @IsBoolean()
  integridad: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 191,
    example: 'NAS02/respaldos/BD-CORE/2026-07-05.bak',
    description:
      'Referencia a lo generado (ruta, etiqueta de cinta, id del trabajo). Se DOCUMENTA: la aplicación no comprueba que el archivo exista.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}

export class ModificarEjecucionDto extends IntersectionType(
  PartialType(OmitType(RegistrarEjecucionDto, ['planId'] as const)),
  MotivoCambioDto,
) {}

export class QueryEjecucionesDto extends QueryPeriodoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId?: number;

  @ApiPropertyOptional({ enum: ResultadoOperacion })
  @IsOptional()
  @IsEnum(ResultadoOperacion)
  resultado?: ResultadoOperacion;
}

export class EjecucionRespaldoDto extends IntersectionType(
  OmitType(RegistrarEjecucionDto, ['evidencia', 'observaciones'] as const),
  RegistroDto,
) {
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true }) observaciones: string | null;
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
}

export class PaginatedEjecucionRespaldoDto extends PaginatedResponseDto(EjecucionRespaldoDto) {}

// ── Paso 3 · Restauración o prueba ──────────────────────────────────────────

export class RegistrarRestauracionDto {
  @ApiProperty({ example: 12, description: 'Ejecución de origen (no fallida ni anulada).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ejecucionId: number;

  @ApiProperty({ type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @ApiProperty({ enum: MotivoRestauracion })
  @IsEnum(MotivoRestauracion)
  motivo: MotivoRestauracion;

  @ApiProperty({ enum: ResultadoOperacion })
  @IsEnum(ResultadoOperacion)
  resultado: ResultadoOperacion;

  @ApiProperty({ example: 120, description: 'Tiempo real de restauración, en minutos.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  tiempoRealMin: number;

  @ApiProperty({ example: 240, description: 'RTO objetivo, en minutos.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  rtoMinutos: number;

  @ApiProperty({ description: 'Integridad de los datos verificada (A.8.13).' })
  @IsBoolean()
  integridad: boolean;

  @ApiProperty({ example: 'Acta PR-10/2026', description: 'Acta o ticket que la respalda.' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  evidencia: string;

  @ApiProperty({ example: 'Coordinación de Infraestructura' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}

export class ModificarRestauracionDto extends IntersectionType(
  PartialType(OmitType(RegistrarRestauracionDto, ['ejecucionId'] as const)),
  MotivoCambioDto,
) {}

export class QueryRestauracionesDto extends QueryPeriodoDto {
  @ApiPropertyOptional({ enum: ResultadoOperacion })
  @IsOptional()
  @IsEnum(ResultadoOperacion)
  resultado?: ResultadoOperacion;

  @ApiPropertyOptional({ enum: MotivoRestauracion })
  @IsOptional()
  @IsEnum(MotivoRestauracion)
  motivo?: MotivoRestauracion;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ejecucionId?: number;
}

export class RestauracionDto extends IntersectionType(
  OmitType(RegistrarRestauracionDto, ['observaciones'] as const),
  RegistroDto,
) {
  @ApiProperty({ type: String, nullable: true }) observaciones: string | null;
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
}

export class PaginatedRestauracionDto extends PaginatedResponseDto(RestauracionDto) {}

// ── Tablero ─────────────────────────────────────────────────────────────────

export { QueryPeriodoIndicadoresDto as QueryTableroDto } from '../../../common/indicadores/periodo.dto.js';
