import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import {
  EstadoEquipo,
  FaseMantenimiento,
  TipoMantenimiento,
} from '../../../generated/prisma/enums.js';

/** En la query string todo llega como texto: "true"/"false" → boolean. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class QueryMantenimientosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ enum: TipoMantenimiento })
  @IsOptional()
  @IsEnum(TipoMantenimiento)
  tipo?: TipoMantenimiento;

  @ApiPropertyOptional({ enum: FaseMantenimiento })
  @IsOptional()
  @IsEnum(FaseMantenimiento)
  fase?: FaseMantenimiento;

  @ApiPropertyOptional({ enum: EstadoEquipo })
  @IsOptional()
  @IsEnum(EstadoEquipo)
  estadoEquipo?: EstadoEquipo;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha programada desde (incluida). Útil para calendarios.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha programada hasta (incluida).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;

  @ApiPropertyOptional({
    description:
      'true = solo PROGRAMADOS con fecha pasada; false = excluirlos.',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  vencidos?: boolean;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Orden por fecha programada.',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Sincronización incremental: solo mantenimientos modificados después de esta fecha.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;
}
