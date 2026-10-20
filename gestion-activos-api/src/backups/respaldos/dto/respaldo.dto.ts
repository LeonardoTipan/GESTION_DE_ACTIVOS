import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import {
  EstadoEjecucion,
  EstadoPrueba,
} from '../../../generated/prisma/enums.js';
import { ETAPAS_RESPALDO, type EtapaRespaldo } from '../etapa.js';

/** Datos mínimos del activo respaldado, para mostrarlo sin otra petición. */
export class ActivoResumenDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'SRV-001' })
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos' })
  nombre: string;
}

export class RespaldoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ type: ActivoResumenDto })
  activo: ActivoResumenDto;

  @ApiProperty({
    enum: ETAPAS_RESPALDO,
    description: 'Etapa del ciclo de vida, derivada de los dos estados.',
  })
  etapa: EtapaRespaldo;

  // Capa 1: alcance
  @ApiProperty({ example: 'Base de datos ERP completa' })
  alcanceDetalle: string;

  // Capa 2: ejecución
  @ApiProperty({ enum: EstadoEjecucion })
  estadoEjecucion: EstadoEjecucion;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaEjecucion: Date | null;

  @ApiProperty({ type: String, nullable: true })
  rutaEvidencia: string | null;

  // Capa 3: restauración / prueba
  @ApiProperty({ enum: EstadoPrueba })
  estadoPrueba: EstadoPrueba;

  @ApiProperty({ type: String, nullable: true })
  resultadoPrueba: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaPrueba: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class PaginatedRespaldoDto extends PaginatedResponseDto(RespaldoDto) {}
