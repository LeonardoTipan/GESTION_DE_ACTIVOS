import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import {
  TIPOS_NOTIFICACION,
  type TipoNotificacion,
} from '../../notificaciones.js';

export class QueryNotificacionesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Solo las que aún no se han leído.', default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  soloNoLeidas: boolean = false;
}

export class NotificacionDto {
  @ApiProperty({ example: 31 })
  id: number;

  @ApiProperty({ enum: TIPOS_NOTIFICACION })
  tipo: TipoNotificacion;

  @ApiProperty({ example: 'GLPI-PC-5 · LP-CONTABILIDAD: estado Bueno → Malo' })
  titulo: string;

  @ApiProperty({
    description:
      'Cambios { campo: { antes, despues } }; en los errores de sincronización, { mensaje }.',
    type: 'object',
    additionalProperties: true,
    example: { estado: { antes: 'Bueno', despues: 'Malo' } },
  })
  detalle: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  fecha: Date;

  @ApiProperty()
  leida: boolean;

  @ApiProperty({ type: Number, nullable: true, description: 'Activo afectado, si lo hay.' })
  activoId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  sincronizacionId: number | null;
}

export class PaginatedNotificacionDto extends PaginatedResponseDto(NotificacionDto) {}

export class ResumenNotificacionesDto {
  @ApiProperty({ example: 4 })
  noLeidas: number;
}
