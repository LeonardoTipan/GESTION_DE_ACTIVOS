import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { RegistroDto, aBooleano } from '../common/dto/registro.dto.js';
import { EstadoPeriodoEndpoint } from '../generated/prisma/enums.js';

/** Fase 1 · apertura del período mensual (los datos de la fase 2 llegarán con su propia API). */
export class AbrirPeriodoDto {
  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 12, description: '1 = enero … 12 = diciembre. No futuro (respecto al mes en curso).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @ApiProperty({ example: 'Soporte TIC', description: 'Persona encargada del período.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiPropertyOptional({ example: 'Corte con el inventario de GLPI del último día hábil.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observacion?: string;
}

export class QueryPeriodosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({ enum: EstadoPeriodoEndpoint })
  @IsOptional()
  @IsEnum(EstadoPeriodoEndpoint)
  estado?: EstadoPeriodoEndpoint;

  @ApiPropertyOptional({ default: false, description: 'true = incluye los anulados (por defecto se ocultan).' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados?: boolean;
}

export class PeriodoEndpointDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() anio: number;
  @ApiProperty({ description: '1 = enero … 12 = diciembre.' }) mes: number;
  @ApiProperty() responsable: string;
  @ApiProperty({ type: String, nullable: true }) observacion: string | null;
  @ApiProperty({ enum: EstadoPeriodoEndpoint }) estado: EstadoPeriodoEndpoint;
}

export class PaginatedPeriodoEndpointDto extends PaginatedResponseDto(PeriodoEndpointDto) {}
