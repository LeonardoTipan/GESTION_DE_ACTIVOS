import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  EstadoPlan,
  FrecuenciaPrueba,
  FrecuenciaRespaldo,
  MedioRespaldo,
  RetencionRespaldo,
  TipoRespaldo,
  VentanaRespaldo,
} from '../../../generated/prisma/enums.js';
import {
  ActivoBreveDto,
  MotivoCambioDto,
  QueryRegistrosDto,
  RegistroDto,
} from './comun.dto.js';

/** Parámetros comprometidos de un plan (comunes al alta y a la modificación). */
export class ParametrosPlanDto {
  @ApiProperty({ enum: FrecuenciaRespaldo })
  @IsEnum(FrecuenciaRespaldo)
  frecuencia: FrecuenciaRespaldo;

  @ApiProperty({ enum: TipoRespaldo })
  @IsEnum(TipoRespaldo)
  tipo: TipoRespaldo;

  @ApiProperty({ enum: MedioRespaldo })
  @IsEnum(MedioRespaldo)
  medio: MedioRespaldo;

  @ApiProperty({ enum: VentanaRespaldo })
  @IsEnum(VentanaRespaldo)
  ventana: VentanaRespaldo;

  @ApiProperty({ enum: RetencionRespaldo })
  @IsEnum(RetencionRespaldo)
  retencion: RetencionRespaldo;

  @ApiProperty({ enum: FrecuenciaPrueba, description: 'Cada cuánto se prueba la restauración.' })
  @IsEnum(FrecuenciaPrueba)
  frecuenciaPrueba: FrecuenciaPrueba;

  @ApiProperty({ example: 24, description: 'RPO comprometido, en horas.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  rpoHoras: number;

  @ApiProperty({ example: 240, description: 'RTO objetivo, en minutos.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  rtoMinutos: number;

  @ApiProperty({ example: 'Coordinación de Infraestructura' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({
    maxLength: 300,
    example: 'Base de datos institucional de criticidad alta con información reservada.',
    description: 'Necesidad de continuidad, criticidad y clasificación que sustentan la inclusión.',
  })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  justificacion: string;
}

/** Paso 1: se genera un plan por cada activo seleccionado, con los mismos parámetros. */
export class CrearPlanesDto extends ParametrosPlanDto {
  @ApiProperty({ type: [Number], example: [5, 8], description: 'Activos operativos sin plan vigente.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos un activo.' })
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  activoIds: number[];

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Por defecto, hoy.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  vigenteDesde?: Date;
}

/** El activo de un plan no se sustituye: se anula el plan y se crea otro. */
export class ModificarPlanDto extends IntersectionType(
  PartialType(ParametrosPlanDto),
  MotivoCambioDto,
) {
  @ApiPropertyOptional({ enum: EstadoPlan })
  @IsOptional()
  @IsEnum(EstadoPlan)
  estado?: EstadoPlan;
}

export class QueryPlanesDto extends QueryRegistrosDto {
  @ApiPropertyOptional({ enum: EstadoPlan })
  @IsOptional()
  @IsEnum(EstadoPlan)
  estado?: EstadoPlan;
}

export class PlanRespaldoDto extends IntersectionType(
  OmitType(ParametrosPlanDto, [] as const),
  RegistroDto,
) {
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty({ enum: EstadoPlan }) estado: EstadoPlan;
  @ApiProperty({ type: String, format: 'date-time' }) vigenteDesde: Date;
}

export class PaginatedPlanRespaldoDto extends PaginatedResponseDto(PlanRespaldoDto) {}
