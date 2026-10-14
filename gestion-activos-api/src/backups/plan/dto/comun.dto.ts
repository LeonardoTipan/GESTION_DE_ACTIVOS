import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export { MotivoCambioDto } from '../../../audit/dto/traza.dto.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export const aBooleano = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

/** Campos de vida del registro: versión y anulación lógica. */
export class RegistroDto {
  @ApiProperty({ example: 1, description: 'Sube con cada modificación.' })
  version: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'null = vigente.' })
  anuladoEn: Date | null;

  @ApiProperty({ type: String, nullable: true })
  anuladoPor: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivoAnulacion: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

/** Activo tal como se muestra junto a un registro. */
export class ActivoBreveDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ type: String, nullable: true }) tipo: string | null;
  @ApiProperty({ type: String, nullable: true }) estado: string | null;
  @ApiProperty({ example: 'Alta', description: 'Nivel de criticidad.' }) criticidad: string;
}

export const SELECT_ACTIVO = {
  select: {
    id: true,
    codigo: true,
    nombre: true,
    tipo: true,
    estado: true,
    criticidad: { select: { nivel: true } },
  },
} as const;

/** El activo con la criticidad aplanada. */
export const activoBreve = (a: {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string | null;
  estado: string | null;
  criticidad: { nivel: string };
}): ActivoBreveDto => ({ ...a, criticidad: a.criticidad.nivel });

/** Filtros comunes de los listados de respaldos. */
export class QueryRegistrosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'false = oculta los registros anulados (por defecto se muestran, marcados).',
  })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados: boolean = true;
}

/** Período por fecha del registro (ejecución o restauración). */
export class QueryPeriodoDto extends QueryRegistrosDto {
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-07-01' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-09-30' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;
}
