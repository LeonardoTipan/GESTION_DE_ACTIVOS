import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const SITUACIONES_VENTANA = ['CUMPLIDA', 'VENCIDA', 'EN_CURSO', 'PROGRAMADA'] as const;

export class QueryBitacoraEspecificaRespaldosDto extends PaginationQueryDto {
  @ApiProperty({ minimum: 2000, maximum: 2100, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Mes (1–12) en que termina la ventana; sin él, el año entero.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @ApiPropertyOptional({ enum: SITUACIONES_VENTANA, description: 'CUMPLIDA (validada), VENCIDA (sin ejecución exitosa), EN_CURSO o PROGRAMADA.' })
  @IsOptional()
  @IsIn(SITUACIONES_VENTANA)
  situacion?: (typeof SITUACIONES_VENTANA)[number];

  @ApiPropertyOptional({ description: 'Código o nombre del sistema respaldado.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Responsable del plan o de la ejecución (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  responsable?: string;
}

class SistemaRespaldadoDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
}

class EjecucionVentanaDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: '2026-03-05', description: 'Día local de la ejecución.' }) fecha: string;
  @ApiProperty({ enum: ['EXITOSO', 'PARCIAL', 'FALLIDO'] }) resultado: string;
  @ApiProperty() responsable: string;
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;
}

class RestauracionVentanaDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: '2026-03-20', description: 'Día local de la restauración (aprobación cuando es EXITOSA).' }) fecha: string;
  @ApiProperty({ enum: ['EXITOSO', 'PARCIAL', 'FALLIDO'] }) resultado: string;
  @ApiProperty() motivo: string;
  @ApiProperty({ description: 'Acta o informe de la restauración.' }) evidencia: string;
  @ApiProperty() responsable: string;
}

/** Una ventana programada: la unidad del «Total programados». */
export class FilaBitacoraRespaldoDto {
  @ApiProperty() planId: number;
  @ApiProperty({ type: SistemaRespaldadoDto }) activo: SistemaRespaldadoDto;
  @ApiProperty({ description: 'Responsable del plan.' }) responsablePlan: string;
  @ApiProperty({ example: '2026-03-01' }) ini: string;
  @ApiProperty({ example: '2026-03-31' }) fin: string;
  @ApiProperty({ example: 'marzo de 2026' }) etiqueta: string;
  @ApiProperty({ description: 'Mes (1–12) de la Bitácora General.' }) mes: number;
  @ApiProperty({ enum: SITUACIONES_VENTANA }) situacion: string;
  @ApiProperty({ type: EjecucionVentanaDto, nullable: true, description: 'La ejecución EXITOSA que la valida o, si no la hay, la última registrada.' })
  ejecucion: EjecucionVentanaDto | null;
  @ApiProperty({ description: 'Ejecuciones FALLIDAS o PARCIALES de la ventana (no la validan).' }) noValidas: number;
  @ApiProperty({ type: RestauracionVentanaDto, nullable: true, description: 'Última restauración o prueba de esa ejecución.' })
  restauracion: RestauracionVentanaDto | null;
}

export class PaginatedFilaBitacoraRespaldoDto extends PaginatedResponseDto(FilaBitacoraRespaldoDto) {}
