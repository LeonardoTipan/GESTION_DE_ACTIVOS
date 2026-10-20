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
} from 'class-validator';
import type { Prisma } from '../../generated/prisma/client.js';
import { Trim } from '../decorators/trim.decorator.js';
import { PaginationQueryDto } from './pagination-query.dto.js';

export { MotivoCambioDto } from '../../audit/dto/traza.dto.js';

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

/** Activo tal como se muestra junto a un registro: con su categoría. */
export class ActivoBreveDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ type: String, nullable: true }) tipo: string | null;
  @ApiProperty({ type: String, nullable: true }) estado: string | null;
  @ApiProperty({ example: 'Alta', description: 'Nivel de criticidad.' }) criticidad: string;
  @ApiProperty({ example: 'Computadoras', description: 'Categoría (tipo de activo de GLPI).' }) categoria: string;
  @ApiProperty() categoriaId: number;
}

export const SELECT_ACTIVO = {
  select: {
    id: true,
    codigo: true,
    nombre: true,
    tipo: true,
    estado: true,
    categoriaId: true,
    criticidad: { select: { nivel: true } },
    categoria: { select: { nombre: true } },
  },
} as const;

/** El activo con la criticidad y la categoría aplanadas. */
export const activoBreve = (a: {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string | null;
  estado: string | null;
  categoriaId: number;
  criticidad: { nivel: string };
  categoria: { nombre: string };
}): ActivoBreveDto => ({ ...a, criticidad: a.criticidad.nivel, categoria: a.categoria.nombre });

/** Filtros comunes de los listados de registros operativos. */
export class QueryRegistrosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ example: 7, description: 'Categoría del activo (tipo de activo de GLPI).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ description: 'Busca en el código y el nombre del activo.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Responsable (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  responsable?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'false = oculta los registros anulados (por defecto se muestran, marcados).',
  })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados: boolean = true;
}

/** Período por fecha del registro. */
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

/**
 * Condiciones comunes: activo, categoría y búsqueda por código o nombre del
 * activo, y si se muestran los anulados.
 */
export function filtroRegistros(
  q: QueryRegistrosDto,
): { activoId?: number; anuladoEn?: null; activo?: Prisma.ActivoWhereInput } {
  const activo: Prisma.ActivoWhereInput = {
    categoriaId: q.categoriaId,
    ...(q.q ? { OR: [{ codigo: { contains: q.q } }, { nombre: { contains: q.q } }] } : {}),
  };
  return {
    activoId: q.activoId,
    ...(q.incluirAnulados ? {} : { anuladoEn: null }),
    ...(q.categoriaId || q.q ? { activo } : {}),
  };
}

/** "hasta" incluye todo ese día. */
export const finDelDia = (d: Date) => new Date(d.getTime() + 24 * 3_600_000 - 1);
