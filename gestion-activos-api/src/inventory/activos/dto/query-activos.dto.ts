import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export const CAMPOS_ORDEN_ACTIVOS = [
  'codigo',
  'nombre',
  'custodio',
  'ubicacion',
  'ultimaRevision',
  'createdAt',
  'updatedAt',
] as const;
export type CampoOrdenActivos = (typeof CAMPOS_ORDEN_ACTIVOS)[number];

/** En la query string todo llega como texto: "true"/"false" → boolean. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class QueryActivosDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca en código, nombre, custodio y ubicación.',
    example: 'servidor',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  criticidadId?: number;

  @ApiPropertyOptional({
    description: 'Filtra por activos cifrados (true) o sin cifrar (false).',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  cifrado?: boolean;

  @ApiPropertyOptional({ enum: CAMPOS_ORDEN_ACTIVOS, default: 'codigo' })
  @IsOptional()
  @IsIn(CAMPOS_ORDEN_ACTIVOS)
  sort: CampoOrdenActivos = 'codigo';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Sincronización incremental: solo activos modificados DESPUÉS de esta fecha. ' +
      'Incluye los dados de baja (deletedAt ≠ null) para que el frontend los retire.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;

  @ApiPropertyOptional({
    description: 'Incluir activos dados de baja.',
    default: false,
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  incluirBajas: boolean = false;
}
