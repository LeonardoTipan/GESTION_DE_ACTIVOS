import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxDate,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { RegistroDto } from '../../common/dto/registro.dto.js';
import {
  NivelRiesgo,
  PrioridadVulnerabilidad,
  ResultadoVerificacionVulnerabilidad,
} from '../../generated/prisma/enums.js';
import { RegistrarVulnerabilidadDto } from '../vulnerabilidades/dto/acciones.dto.js';

const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

// ── Capa 1 · Identificación ─────────────────────────────────────────────────

/** La misma vulnerabilidad en varios activos: se crea un registro por activo. */
export class RegistrarLoteDto extends OmitType(RegistrarVulnerabilidadDto, ['activoId'] as const) {
  @ApiProperty({ type: [Number], example: [5, 8], description: 'Activos operativos afectados.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos un activo.' })
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  activoIds: number[];
}

// ── Capa 2 · Evaluación y tratamiento ───────────────────────────────────────

export class EvaluarVulnerabilidadDto {
  @ApiProperty({ enum: PrioridadVulnerabilidad, description: 'P1 = atender de inmediato.' })
  @IsEnum(PrioridadVulnerabilidad)
  prioridad: PrioridadVulnerabilidad;

  @ApiProperty({ example: 'Coordinación de Infraestructura' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ example: 'Actualizar OpenSSL a 3.0.15 en la próxima ventana de mantenimiento.' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  planRemediacion: string;

  @ApiPropertyOptional({ enum: NivelRiesgo, description: 'Si la evaluación cambia el nivel de riesgo.' })
  @IsOptional()
  @IsEnum(NivelRiesgo)
  nivelRiesgo?: NivelRiesgo;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Plazo (SLA) acordado.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaLimite?: Date;
}

export class RegistrarAccionDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fecha no puede estar en el futuro' })
  fecha: Date;

  @ApiProperty({ example: 'Aplicado el parche KB5031234 en el servidor.' })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  descripcion: string;

  @ApiProperty({ example: 'jperez' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiPropertyOptional({ example: 'Ticket CHG-2026-118' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;
}

export class AccionRemediacionDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() vulnerabilidadId: number;
  @ApiProperty({ type: String, format: 'date-time' }) fecha: Date;
  @ApiProperty() descripcion: string;
  @ApiProperty() responsable: string;
  @ApiProperty({ type: String, nullable: true }) evidencia: string | null;
  @ApiProperty() registradoPor: string;
}

// ── Capa 3 · Verificación y cierre ──────────────────────────────────────────

export class RegistrarVerificacionVulnerabilidadDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fecha no puede estar en el futuro' })
  fecha: Date;

  @ApiProperty({
    enum: ResultadoVerificacionVulnerabilidad,
    description: 'CORREGIDA cierra la vulnerabilidad; PERSISTE la mantiene en tratamiento (o la reabre si estaba cerrada).',
  })
  @IsEnum(ResultadoVerificacionVulnerabilidad)
  resultado: ResultadoVerificacionVulnerabilidad;

  @ApiProperty({ example: 'Escaneo posterior sin hallazgos para CVE-2026-12345.' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  observaciones: string;

  @ApiProperty({ example: 'Informe de escaneo 2026-10-15' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(191)
  evidencia: string;

  @ApiProperty({ example: 'Oficial de Seguridad' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;
}

export class VerificacionVulnerabilidadDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() vulnerabilidadId: number;
  @ApiProperty({ type: String, format: 'date-time' }) fecha: Date;
  @ApiProperty({ enum: ResultadoVerificacionVulnerabilidad }) resultado: ResultadoVerificacionVulnerabilidad;
  @ApiProperty() observaciones: string;
  @ApiProperty() evidencia: string;
  @ApiProperty() responsable: string;
  @ApiProperty() registradoPor: string;
}
