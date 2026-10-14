import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { ActivoBreveDto } from '../../../common/dto/registro.dto.js';
import {
  EstadoVulnerabilidad,
  FuenteVulnerabilidad,
  NivelRiesgo,
  PrioridadVulnerabilidad,
} from '../../../generated/prisma/enums.js';

/** Datos mínimos del activo afectado, para mostrarlo sin otra petición. */
export class ActivoAfectadoDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'SRV-001' })
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos' })
  nombre: string;
}

export class VulnerabilidadDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ type: ActivoBreveDto })
  activo: ActivoBreveDto;

  @ApiProperty({ type: String, nullable: true, example: 'CVE-2026-12345' })
  cve: string | null;

  @ApiProperty()
  descripcion: string;

  @ApiProperty({ enum: NivelRiesgo })
  nivelRiesgo: NivelRiesgo;

  @ApiProperty({ enum: EstadoVulnerabilidad })
  estado: EstadoVulnerabilidad;

  @ApiProperty({
    description: 'Pendiente y con la fecha límite ya pasada (calculado).',
    example: false,
  })
  vencida: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Acción aplicada al mitigar, o justificación al aceptar el riesgo.',
  })
  mitigacion: string | null;

  @ApiProperty({ enum: FuenteVulnerabilidad }) fuente: FuenteVulnerabilidad;
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Capa 1: confirmada tras comprobarla.' })
  confirmadaEn: Date | null;
  @ApiProperty({ type: String, nullable: true }) confirmadaPor: string | null;
  @ApiProperty({ enum: PrioridadVulnerabilidad, nullable: true, description: 'Capa 2: evaluación.' })
  prioridad: PrioridadVulnerabilidad | null;
  @ApiProperty({ type: String, nullable: true }) responsable: string | null;
  @ApiProperty({ type: String, nullable: true }) planRemediacion: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) evaluadaEn: Date | null;
  @ApiProperty({ type: String, nullable: true }) evaluadaPor: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Quién la cerró (verificación) o aceptó el riesgo.' })
  cerradaPor: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha de detección.',
  })
  fecha: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaLimite: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Se registra automáticamente al mitigar o aceptar el riesgo.',
  })
  fechaCierre: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ example: 1, description: 'Sube con cada modificación.' })
  version: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Anulado (eliminación lógica); null = vigente.' })
  anuladoEn: Date | null;

  @ApiProperty({ type: String, nullable: true })
  anuladoPor: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivoAnulacion: string | null;
}

export class PaginatedVulnerabilidadDto extends PaginatedResponseDto(
  VulnerabilidadDto,
) {}
