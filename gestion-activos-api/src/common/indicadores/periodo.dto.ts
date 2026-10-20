import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

/** Período de los indicadores; por defecto, el trimestre actual. */
export class QueryPeriodoIndicadoresDto {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'Por defecto, inicio del trimestre actual.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Por defecto, fin del trimestre actual.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;
}
