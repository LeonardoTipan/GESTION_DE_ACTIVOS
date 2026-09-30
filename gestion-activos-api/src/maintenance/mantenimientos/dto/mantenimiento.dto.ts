import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import {
  EstadoEquipo,
  FaseMantenimiento,
  TipoMantenimiento,
} from '../../../generated/prisma/enums.js';

/** Datos mínimos del activo, para mostrarlo sin otra petición. */
export class ActivoMantenidoDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'SRV-001' })
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos' })
  nombre: string;
}

export class MantenimientoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ type: ActivoMantenidoDto })
  activo: ActivoMantenidoDto;

  @ApiProperty({ enum: TipoMantenimiento })
  tipo: TipoMantenimiento;

  @ApiProperty({ enum: FaseMantenimiento })
  fase: FaseMantenimiento;

  @ApiProperty({
    description: 'PROGRAMADO con fecha ya pasada (calculado).',
    example: false,
  })
  vencido: boolean;

  @ApiProperty({ example: 'Limpieza interna y actualización de firmware' })
  actividad: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha programada.',
  })
  fecha: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaInicio: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaFin: Date | null;

  @ApiProperty({
    enum: EstadoEquipo,
    nullable: true,
    description: 'Se registra al finalizar.',
  })
  estadoEquipo: EstadoEquipo | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resultado al finalizar o motivo al cancelar.',
  })
  resultado: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class PaginatedMantenimientoDto extends PaginatedResponseDto(
  MantenimientoDto,
) {}
