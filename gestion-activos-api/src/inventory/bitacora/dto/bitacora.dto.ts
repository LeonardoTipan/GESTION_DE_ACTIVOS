import { ApiProperty } from '@nestjs/swagger';
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
