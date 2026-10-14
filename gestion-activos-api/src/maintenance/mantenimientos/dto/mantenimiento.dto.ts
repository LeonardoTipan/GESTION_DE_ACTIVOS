import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { ActivoBreveDto } from '../../../common/dto/registro.dto.js';
import type { CierreMantenimiento } from '../../planes/frecuencia.js';
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

  @ApiProperty({ type: ActivoBreveDto })
  activo: ActivoBreveDto;

  @ApiProperty({ type: Number, nullable: true, description: 'Plan del que procede (capa 1).' })
  planId: number | null;

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

  @ApiProperty({ example: 1, description: 'Sube con cada modificación.' })
  version: number;

  @ApiProperty({ type: String, nullable: true }) tecnico: string | null;
  @ApiProperty({ type: String, nullable: true }) diagnostico: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Minutos.' }) duracionMin: number | null;
  @ApiProperty({ type: Number, nullable: true }) costo: number | null;
  @ApiProperty({ type: String, nullable: true }) repuestos: string | null;
  @ApiProperty({ type: String, nullable: true }) observaciones: string | null;
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;

  @ApiProperty({
    enum: ['NO_APLICA', 'PENDIENTE_VERIFICACION', 'CERRADO', 'EN_SEGUIMIENTO', 'NO_SATISFACTORIO'],
    description: 'Capa 3: según la última verificación vigente (solo en los FINALIZADOS).',
  })
  cierre: CierreMantenimiento;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Anulado (eliminación lógica); null = vigente.' })
  anuladoEn: Date | null;

  @ApiProperty({ type: String, nullable: true })
  anuladoPor: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivoAnulacion: string | null;
}

export class PaginatedMantenimientoDto extends PaginatedResponseDto(
  MantenimientoDto,
) {}
