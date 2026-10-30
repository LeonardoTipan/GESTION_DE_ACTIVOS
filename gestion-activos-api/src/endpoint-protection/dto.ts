import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { RegistroDto, aBooleano } from '../common/dto/registro.dto.js';
import { EstadoPeriodoEndpoint } from '../generated/prisma/enums.js';

/** Fase 1 · apertura del período mensual. Los datos de la fase 2 van en DatosRegistroPeriodoDto. */
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

/**
 * Fase 2 · registro y cierre del mes. Todo opcional al guardar avance; al cerrar se exigen los
 * dos totales, el verificable y el repositorio. Los totales los digita el técnico según el
 * inventario real: el número de equipos que ve la aplicación es solo una referencia.
 */
export class DatosRegistroPeriodoDto {
  @ApiPropertyOptional({ example: 26, minimum: 1, description: 'Total de equipos sujetos al control según el inventario del mes.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  totalActivos?: number;

  @ApiPropertyOptional({ example: 25, minimum: 0, description: 'Equipos con antivirus/EDR activo; no puede superar el total.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  equiposConAntivirus?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha REAL en que se hizo la medición: la indica el usuario (no futura, no anterior al mes del período).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaEjecucion?: Date;

  @ApiPropertyOptional({ example: 'Soporte TIC · J. Pérez', description: 'Quién realizó la medición del mes.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsableEjecucion?: string;

  @ApiPropertyOptional({
    example: 'Inventario de equipos octubre 2026.xlsx',
    description: '«Verificable»: nombre del archivo Excel del inventario de equipos del mes (la aplicación no guarda archivos).',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ example: 'Carpeta Compartida TICs/Antivirus', description: '«Repositorio Verificable»: carpeta o URL http(s).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({ example: 'Un equipo en reparación sin antivirus.', description: 'Observación del período (la de la apertura, ampliada).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observacion?: string;
}

export class ReabrirPeriodoDto {
  @ApiProperty({ example: 'El inventario del mes tenía equipos duplicados: hay que corregir el total.' })
  @Trim()
  @IsString()
  @MinLength(20, { message: 'El motivo debe tener al menos 20 caracteres.' })
  @MaxLength(2000)
  motivo: string;
}

export class QueryPeriodosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

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
  // Fase 2
  @ApiProperty({ type: Number, nullable: true }) totalActivos: number | null;
  @ApiProperty({ type: Number, nullable: true }) equiposConAntivirus: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha real de la medición.' }) fechaEjecucion: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Quién realizó la medición.' }) responsableEjecucion: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Verificable».' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Repositorio Verificable».' }) repositorioVerificable: string | null;
  @ApiProperty({ type: String, nullable: true }) cerradoPor: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Calculada (no se guarda): equipos con antivirus ÷ total × 100, con 1 decimal.' })
  cobertura: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Calculado: total − con antivirus.' }) equiposSinAntivirus: number | null;
}

export class PaginatedPeriodoEndpointDto extends PaginatedResponseDto(PeriodoEndpointDto) {}
