import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { ActivoBreveDto } from '../../../common/dto/registro.dto.js';
import { EstadoVulnerabilidad, NivelRiesgo } from '../../../generated/prisma/enums.js';

/**
 * Una vulnerabilidad: los datos de DETECCIÓN y de REMEDIACIÓN del mismo registro.
 * Los nombres de la matriz van entre comillas latinas.
 */
export class VulnerabilidadDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ type: ActivoBreveDto, description: '«Sistema»: el activo de GLPI (código, nombre, categoría).' })
  activo: ActivoBreveDto;

  // ── Detección ──
  @ApiProperty({ type: String, format: 'date-time', description: '«Fecha Detección».' })
  fecha: Date;

  @ApiProperty({ description: '«Vulnerabilidad».' })
  descripcion: string;

  @ApiProperty({ enum: NivelRiesgo, description: '«Criticidad».' })
  nivelRiesgo: NivelRiesgo;

  @ApiProperty({ type: String, nullable: true, description: '«Responsable».' })
  responsable: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'CVE-2026-12345' })
  cve: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Plazo opcional de remediación.' })
  fechaLimite: Date | null;

  // ── Remediación ──
  @ApiProperty({ enum: EstadoVulnerabilidad, description: '«Estado»: ABIERTO, EN_PROGRESO o REMEDIADO.' })
  estado: EstadoVulnerabilidad;

  @ApiProperty({ description: 'Pendiente y con la fecha límite ya pasada (calculado).', example: false })
  vencida: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Inicio real del trabajo (opcional).' })
  tratamientoIniciadoEn: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '«Fecha de Remediación»: fecha REAL de la solución, indicada por el usuario; null = no remediada.',
  })
  fechaRemediacion: Date | null;

  @ApiProperty({ type: String, nullable: true, description: '«Verificable».' })
  evidencia: string | null;

  @ApiProperty({ type: String, nullable: true, description: '«Repositorio Verificable».' })
  repositorioVerificable: string | null;

  @ApiProperty({ type: String, nullable: true, description: '«Observación».' })
  observacion: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Usuario que registró la remediación.' })
  cerradaPor: string | null;

  // ── Registro ──
  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro (automática).' })
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

export class PaginatedVulnerabilidadDto extends PaginatedResponseDto(VulnerabilidadDto) {}
