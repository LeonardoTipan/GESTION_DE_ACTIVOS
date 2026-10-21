import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ActivoBreveDto } from '../common/dto/registro.dto.js';

export const TIPOS_ACCESO = ['LOGICO', 'FISICO'] as const;
export const TIPOS_SOLICITUD = ['ACCESO', 'BAJA'] as const;
export const ESTADOS = ['ABIERTO', 'PENDIENTE', 'CERRADO'] as const;
type TipoAcceso = (typeof TIPOS_ACCESO)[number];
type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];
type Estado = (typeof ESTADOS)[number];

/** Texto vacío → undefined (un campo opcional que el formulario envía en blanco). */
const VacioANulo = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

// ── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Nueva solicitud. El código, el estado (ABIERTO), la fecha de registro y quién
 * la registra los pone el backend: el cliente no los envía.
 */
export class CrearControlAccesoDto {
  @ApiProperty({ enum: TIPOS_ACCESO })
  @IsIn(TIPOS_ACCESO)
  tipoAcceso: TipoAcceso;

  @ApiProperty({ enum: TIPOS_SOLICITUD, description: 'ACCESO = otorgamiento de acceso (ALTA); BAJA = desvinculación de acceso (BAJA). Ninguna modifica el activo.' })
  @IsIn(TIPOS_SOLICITUD)
  tipoSolicitud: TipoSolicitud;

  @ApiPropertyOptional({ description: 'Activo inventariado, vigente y elegible para el tipo de acceso. Si se omite, se exige «recurso».' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ maxLength: 191, example: 'Correo institucional', description: 'Recurso no inventariado: obligatorio si no hay activo.' })
  @VacioANulo()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  recurso?: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Cuándo se pidió (no futura).' })
  @Type(() => Date)
  @IsDate()
  fechaSolicitud: Date;

  @ApiProperty({ maxLength: 191, example: 'Jorge Andrade', description: 'Quién solicita o autoriza el trámite.' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(191)
  nombreSolicitante: string;

  @ApiProperty({ maxLength: 191, example: 'Jefe de Contabilidad', description: 'Cargo de quien solicita o autoriza.' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  cargoSolicitante: string;

  @ApiProperty({ maxLength: 191, example: 'María Pérez', description: 'Quién recibe (ALTA) o pierde (BAJA) el acceso.' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(191)
  nombreUsuarioBeneficiario: string;

  @ApiProperty({ maxLength: 191, example: 'Contabilidad' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  departamento: string;

  @ApiProperty({ minLength: 10, maxLength: 5000, description: 'Motivo o descripción.' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  descripcion: string;
}

/**
 * Modificación de los campos editables (no el estado, que tiene sus acciones).
 * `activoId: null` quita el activo (entonces se exige el recurso). Una solicitud
 * cerrada solo la corrige un admin, con motivo; solo entonces se admiten
 * `fechaAtendido` y `resolucion`.
 */
export class EditarControlAccesoDto extends PartialType(OmitType(CrearControlAccesoDto, ['activoId'] as const)) {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null quita el activo.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === null ? null : value === undefined ? undefined : Number(value)))
  @ValidateIf((o: { activoId?: number | null }) => o.activoId !== null)
  @IsInt()
  @Min(1)
  activoId?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Solo en una solicitud CERRADA (corrección del admin): fecha y hora reales de la atención.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaAtendido?: Date;

  @ApiPropertyOptional({ minLength: 10, maxLength: 5000, description: 'Solo en una solicitud CERRADA (corrección del admin).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  resolucion?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Por qué se modifica (queda en el historial). Obligatorio (≥20) al corregir una cerrada.' })
  @VacioANulo()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo?: string;
}

export class CerrarControlAccesoDto {
  @ApiProperty({ minLength: 10, maxLength: 5000, description: 'Qué se hizo: acceso otorgado (ALTA) o retirado (BAJA).' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  resolucion: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha y hora REALES en que se atendió (obligatoria). Puede ser histórica; no futura ni anterior a la solicitud.',
  })
  @Type(() => Date)
  @IsDate()
  fechaAtendido: Date;
}

export class ReabrirControlAccesoDto {
  @ApiProperty({ minLength: 20, maxLength: 2000, description: 'Por qué se reabre (solo admin; queda en el historial).' })
  @Trim()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  motivo: string;
}

export class QueryControlAccesoDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Código, solicitante, beneficiario, departamento, recurso o activo.' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  q?: string;

  @ApiPropertyOptional({ enum: TIPOS_ACCESO })
  @IsOptional()
  @IsIn(TIPOS_ACCESO)
  tipoAcceso?: TipoAcceso;

  @ApiPropertyOptional({ enum: ESTADOS })
  @IsOptional()
  @IsIn(ESTADOS)
  estado?: Estado;

  @ApiPropertyOptional({ enum: TIPOS_SOLICITUD })
  @IsOptional()
  @IsIn(TIPOS_SOLICITUD)
  tipoSolicitud?: TipoSolicitud;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de solicitud desde.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de solicitud hasta.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;
}

export class QueryActivosElegiblesDto extends PaginationQueryDto {
  @ApiProperty({ enum: TIPOS_ACCESO })
  @IsIn(TIPOS_ACCESO)
  tipoAcceso: TipoAcceso;

  @ApiPropertyOptional({ description: 'Código o nombre.' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;
}

export class QueryCategoriasElegiblesDto {
  @ApiProperty({ enum: TIPOS_ACCESO })
  @IsIn(TIPOS_ACCESO)
  tipoAcceso: TipoAcceso;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export class ControlAccesoDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'CAL-001' }) codigoUnico: string;
  @ApiProperty({ enum: TIPOS_ACCESO }) tipoAcceso: TipoAcceso;
  @ApiProperty({ type: Number, nullable: true }) activoId: number | null;
  @ApiProperty({ type: ActivoBreveDto, nullable: true }) activo: ActivoBreveDto | null;
  @ApiProperty({ type: String, nullable: true }) recurso: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) fechaSolicitud: Date;
  @ApiProperty({ type: String, nullable: true, description: 'Null en solicitudes anteriores a este campo.' }) nombreSolicitante: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Null en solicitudes anteriores a este campo.' }) cargoSolicitante: string | null;
  @ApiProperty() nombreUsuarioBeneficiario: string;
  @ApiProperty() departamento: string;
  @ApiProperty({ enum: TIPOS_SOLICITUD }) tipoSolicitud: TipoSolicitud;
  @ApiProperty() descripcion: string;
  @ApiProperty({ enum: ESTADOS }) estado: Estado;
  @ApiProperty({ type: String, nullable: true }) resolucion: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) fechaCreacion: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fechaAtendido: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class PaginatedControlAccesoDto extends PaginatedResponseDto(ControlAccesoDto) {}

export class HistorialControlAccesoDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'estado', description: 'Campo modificado, o CREACION.' }) campo: string;
  @ApiProperty({ type: String, nullable: true }) valorAnterior: string | null;
  @ApiProperty({ type: String, nullable: true }) valorNuevo: string | null;
  @ApiProperty({ example: 'analista.test' }) usuario: string;
  @ApiProperty({ type: String, format: 'date-time' }) fecha: Date;
  @ApiProperty({ type: String, nullable: true }) motivo: string | null;
}

export class CategoriaElegibleDto {
  @ApiProperty() categoriaId: number;
  @ApiProperty() nombre: string;
  @ApiProperty({ description: 'Activos elegibles de la categoría.' }) total: number;
}

export class PaginatedActivoElegibleDto extends PaginatedResponseDto(ActivoBreveDto) {}
