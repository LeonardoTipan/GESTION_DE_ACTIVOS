import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import {
  EstadoEjecucion,
  EstadoPrueba,
} from '../../../generated/prisma/enums.js';
import { ETAPAS_RESPALDO, type EtapaRespaldo } from '../etapa.js';

export class QueryRespaldosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5, description: 'Respaldos de un activo.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({
    enum: ETAPAS_RESPALDO,
    description:
      'P. ej. PENDIENTE_PRUEBA = ejecutados con éxito que falta probar.',
  })
  @IsOptional()
  @IsIn(ETAPAS_RESPALDO)
  etapa?: EtapaRespaldo;

  @ApiPropertyOptional({ enum: EstadoEjecucion })
  @IsOptional()
  @IsEnum(EstadoEjecucion)
  estadoEjecucion?: EstadoEjecucion;

  @ApiPropertyOptional({ enum: EstadoPrueba })
  @IsOptional()
  @IsEnum(EstadoPrueba)
  estadoPrueba?: EstadoPrueba;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Sincronización incremental: solo respaldos modificados después de esta fecha.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;
}
