import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ActivoBreveDto, RegistroDto, aBooleano } from '../common/dto/registro.dto.js';
import { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';

/** Fase 1 · planificación. La fase 2 (pruebas de seguridad e informe) llegará con su propia API. */
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
}

export class PaginatedEvaluacionSistemaDto extends PaginatedResponseDto(EvaluacionSistemaDto) {}
