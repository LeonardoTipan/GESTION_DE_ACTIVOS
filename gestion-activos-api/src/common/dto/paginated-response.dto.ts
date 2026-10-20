import type { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import type { PaginationQueryDto } from './pagination-query.dto.js';

export class PaginationMetaDto {
  @ApiProperty({ example: 57 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

/** Forma única de todo listado paginado: { data: [...], meta: {...} }. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationQueryDto,
): Paginated<T> {
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/** Genera la clase de respuesta paginada para Swagger, p. ej. PaginatedResponseDto(ActivoDto). */
export function PaginatedResponseDto<T extends Type<unknown>>(item: T) {
  class PaginatedResponse {
    @ApiProperty({ type: item, isArray: true })
    data: InstanceType<T>[];

    @ApiProperty({ type: PaginationMetaDto })
    meta: PaginationMetaDto;
  }
  Object.defineProperty(PaginatedResponse, 'name', {
    value: `Paginated${item.name}`,
  });
  return PaginatedResponse;
}

/** Salto (skip) de Prisma para la página pedida. */
export function skipFor({ page, limit }: PaginationQueryDto): number {
  return (page - 1) * limit;
}
