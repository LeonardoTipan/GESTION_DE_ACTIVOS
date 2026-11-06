import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { ActivoBreveDto } from '../../../common/dto/registro.dto.js';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { ACCIONES_BITACORA, type AccionBitacora } from '../bitacora.service.js';
import type { Cambios } from '../cambios.js';

export class BitacoraDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ enum: ACCIONES_BITACORA, example: 'ACTUALIZAR' })
  accion: AccionBitacora;

  @ApiProperty({
    description: 'Usuario de Keycloak que hizo el cambio (tomado del token).',
    example: 'analista.test',
  })
  responsable: string;

  @ApiProperty({ type: String, format: 'date-time' })
  fecha: Date;

  @ApiProperty({
    description: 'Campos modificados con su valor anterior y el nuevo.',
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: { antes: {}, despues: {} },
    },
    example: { ubicacion: { antes: 'Sala 1', despues: 'Sala 2' } },
  })
  detalle: Cambios;
}

export class PaginatedBitacoraDto extends PaginatedResponseDto(BitacoraDto) {}

// ── Bitácora de movimientos del inventario (consulta global, solo lectura) ──────

export const ORIGENES_MOVIMIENTO = ['MANUAL', 'GLPI'] as const;
export type OrigenMovimiento = (typeof ORIGENES_MOVIMIENTO)[number];

export class QueryMovimientosDto extends PaginationQueryDto {
  @ApiProperty({ minimum: 2000, maximum: 2100, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Mes; sin él, el año entero.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @ApiPropertyOptional({ enum: ACCIONES_BITACORA, description: 'Tipo de operación.' })
  @IsOptional()
  @IsIn(ACCIONES_BITACORA)
  accion?: AccionBitacora;

  @ApiPropertyOptional({ enum: ORIGENES_MOVIMIENTO, description: 'MANUAL (usuario de la aplicación) o GLPI (sincronización).' })
  @IsOptional()
  @IsIn(ORIGENES_MOVIMIENTO)
  origen?: OrigenMovimiento;

  @ApiPropertyOptional({ description: 'Código o nombre del activo.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;
}

export class MovimientoInventarioDto extends BitacoraDto {
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
  @ApiProperty({ enum: ORIGENES_MOVIMIENTO, description: 'GLPI = lo hizo la sincronización; MANUAL = un usuario de la aplicación.' })
  origen: OrigenMovimiento;
  @ApiProperty({ type: String, nullable: true, description: 'Motivo, cuando el movimiento lo registra (p. ej. la inactivación desde GLPI). null = no registrado.' })
  motivo: string | null;
}

export class PaginatedMovimientoInventarioDto extends PaginatedResponseDto(MovimientoInventarioDto) {}
