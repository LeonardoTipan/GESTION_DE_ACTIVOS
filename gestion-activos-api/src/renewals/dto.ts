import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MotivoCambioDto } from '../audit/dto/traza.dto.js';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ActivoBreveDto } from '../common/dto/registro.dto.js';
import { EstadoRenovacion, TipoRenovacion } from '../generated/prisma/enums.js';

const MAX_TEXTO_LARGO = 5000;

/**
 * Un DÍA 'AAAA-MM-DD' (se guarda en una columna DATE). Solo se acepta ese formato:
 * una fecha de calendario no depende de la zona horaria. Un día inexistente
 * (2026-02-30) no es una fecha válida.
 */
function Dia(): PropertyDecorator {
  // Cualquier otro texto (también una fecha con hora) queda como fecha inválida: si se
  // dejara el texto, la conversión implícita del ValidationPipe lo aceptaría.
  // El día construido debe ser el escrito: JavaScript convierte 2026-02-30 en el 2 de marzo.
  const transformar = Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const fecha = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : Number.NaN);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === value ? fecha : new Date(Number.NaN);
  });
  const fecha = IsDate({ message: ({ property }) => `${property} debe ser un día con el formato AAAA-MM-DD` });
  return (objetivo, propiedad) => {
    transformar(objetivo, propiedad);
    fecha(objetivo, propiedad);
  };
}

const aBooleano = () =>
  Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value));

// ── Fase 1 · Planificación ──────────────────────────────────────────────────

export class CrearRenovacionDto {
  @ApiProperty({ example: 5, description: '«Sistema»: activo operativo de GLPI.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId: number;

  @ApiProperty({ enum: TipoRenovacion, example: 'CONTRATO_SERVICIO' })
  @IsEnum(TipoRenovacion)
  tipo: TipoRenovacion;

  @ApiProperty({ example: 'ANALISTA 1', description: '«Responsable»: persona encargada de gestionarla.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-01-25', description: '«Fecha Planificada»: día previsto para renovar.' })
  @Dia()
  fechaPlanificada: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-04-27',
    description: 'Hasta cuándo vale HOY lo que se renueva. Obligatoria salvo sinCaducidadActual. Se conserva como referencia histórica.',
  })
  @IsOptional()
  @Dia()
  fechaCaducidadActual?: Date;

  @ApiPropertyOptional({ description: 'true = sin caducidad conocida o aplicable (p. ej. licencia perpetua): exige justificarlo en la observación.' })
  @IsOptional()
  @IsBoolean()
  sinCaducidadActual?: boolean;

  @ApiPropertyOptional({ description: '«Observación».', maxLength: MAX_TEXTO_LARGO })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  observacion?: string;
}

/** Corrección de la planificación con motivo (activo y tipo, solo mientras está ABIERTO). */
export class EditarPlanificacionDto extends IntersectionType(PartialType(CrearRenovacionDto), MotivoCambioDto) {}

// ── Fase 2 · Ejecución y cierre ─────────────────────────────────────────────

export class DatosEjecucionDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-04-27',
    description: '«Fecha Ejecutada Renovación»: fecha REAL, la indica el usuario (puede ser histórica; no futura).',
  })
  @IsOptional()
  @Dia()
  fechaRenovacion?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2029-04-27',
    description: 'Hasta cuándo vale tras renovar: posterior a la renovación y a la caducidad actual. Obligatoria al cerrar salvo nuevaSinCaducidad.',
  })
  @IsOptional()
  @Dia()
  nuevaFechaCaducidad?: Date;

  @ApiPropertyOptional({ description: 'true = la nueva vigencia no tiene caducidad: exige justificarlo en la observación.' })
  @IsOptional()
  @IsBoolean()
  nuevaSinCaducidad?: boolean;

  @ApiPropertyOptional({ example: 'Informe de Satisfacción del Contrato de Renovación', description: '«Verificable».' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ example: 'Carpeta Compartida TICs/Interno', description: '«Repositorio Verificable»: carpeta o URL http(s).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({ example: 'El servidor fue migrado a la nube con el proveedor XXXXX.', description: '«Descripción»: detalle de la renovación realizada.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  descripcion?: string;

  @ApiPropertyOptional({ description: '«Observación».' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  observacion?: string;
}

/** Guardar o corregir lo ejecutado. Pendiente: sin motivo. CERRADO: solo admin y con motivo. */
export class ActualizarEjecucionDto extends DatosEjecucionDto {
  @ApiPropertyOptional({ description: 'Obligatorio si ya está CERRADA (mínimo 20 caracteres).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  motivoCambio?: string;
}

export class ReabrirRenovacionDto {
  @ApiProperty({ example: 'El proveedor anuló la factura: la renovación no se completó.' })
  @Trim()
  @IsString()
  @MinLength(20, { message: 'El motivo debe tener al menos 20 caracteres.' })
  @MaxLength(MAX_TEXTO_LARGO)
  motivo: string;
}

// ── Consulta ────────────────────────────────────────────────────────────────

export const VIGENCIAS = ['VIGENTE', 'PROXIMA', 'CADUCADA', 'SIN_CADUCIDAD', 'SUSTITUIDA'] as const;

export class QueryRenovacionesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '«Sistema».' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ description: 'Categoría del activo.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ enum: TipoRenovacion })
  @IsOptional()
  @IsEnum(TipoRenovacion)
  tipo?: TipoRenovacion;

  @ApiPropertyOptional({ enum: EstadoRenovacion, description: 'Estado del proceso.' })
  @IsOptional()
  @IsEnum(EstadoRenovacion)
  estado?: EstadoRenovacion;

  @ApiPropertyOptional({ description: '«Responsable» (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  responsable?: string;

  @ApiPropertyOptional({ description: 'true = solo pendientes (ABIERTO o EN_PROGRESO); false = solo cerradas.' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  pendientes?: boolean;

  @ApiPropertyOptional({ enum: VIGENCIAS, description: 'Vigencia del elemento (no el estado del proceso).' })
  @IsOptional()
  @IsIn(VIGENCIAS)
  vigencia?: (typeof VIGENCIAS)[number];

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Caduca desde este día (vigencia que rige hoy).' })
  @IsOptional()
  @Dia()
  caducaDesde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Caduca hasta este día (incluido).' })
  @IsOptional()
  @Dia()
  caducaHasta?: Date;

  @ApiPropertyOptional({ description: 'Busca en el código y nombre del activo, la descripción y el verificable.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: true, description: 'false = oculta las anuladas.' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados: boolean = true;
}

export class QueryCaducidadesDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Horizonte en días (por defecto, el umbral configurado). Incluye las ya caducadas.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dias?: number;
}

// ── Respuestas ──────────────────────────────────────────────────────────────

class RenovacionBreveDto {
  @ApiProperty() id: number;
  @ApiProperty({ type: String, format: 'date', nullable: true }) fechaRenovacion: Date | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) nuevaFechaCaducidad: Date | null;
}

export class RenovacionDto {
  @ApiProperty() id: number;
  @ApiProperty() activoId: number;
  @ApiProperty({ type: ActivoBreveDto, description: '«Sistema».' }) activo: ActivoBreveDto;
  @ApiProperty({ enum: TipoRenovacion }) tipo: TipoRenovacion;
  @ApiProperty({ description: '«Responsable».' }) responsable: string;
  @ApiProperty({ type: String, format: 'date', description: '«Fecha Planificada».' }) fechaPlanificada: Date;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Caducidad antes de renovar (referencia histórica).' })
  fechaCaducidadActual: Date | null;
  @ApiProperty() sinCaducidadActual: boolean;
  @ApiProperty({ enum: EstadoRenovacion, description: 'Estado del proceso.' }) estado: EstadoRenovacion;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '«Fecha Ejecutada Renovación» (real).' })
  fechaRenovacion: Date | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Caducidad después de renovar.' })
  nuevaFechaCaducidad: Date | null;
  @ApiProperty() nuevaSinCaducidad: boolean;
  @ApiProperty({ type: String, nullable: true, description: '«Verificable».' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Repositorio Verificable».' }) repositorioVerificable: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Descripción».' }) descripcion: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Observación».' }) observacion: string | null;
  @ApiProperty({ type: String, nullable: true }) cerradaPor: string | null;

  @ApiProperty({ enum: VIGENCIAS, description: 'Vigencia del ELEMENTO hoy (calculada), distinta del estado del proceso.' })
  vigencia: (typeof VIGENCIAS)[number];
  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Fecha de caducidad que rige hoy.' })
  venceEl: Date | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Días hasta la caducidad (negativo: ya caducó).' })
  diasRestantes: number | null;
  @ApiProperty({ type: RenovacionBreveDto, nullable: true, description: 'Renovación anterior del mismo elemento.' })
  renovacionAnterior: RenovacionBreveDto | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Renovación posterior que la sustituye.' })
  sustituidaPor: number | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro (automática).' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
  @ApiProperty() version: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) anuladoEn: Date | null;
  @ApiProperty({ type: String, nullable: true }) anuladoPor: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoAnulacion: string | null;
}

export class PaginatedRenovacionDto extends PaginatedResponseDto(RenovacionDto) {}

export class ResumenVigenciasDto {
  @ApiProperty({ description: 'Umbral de «próximo a caducar», en días.' }) diasAviso: number;
  @ApiProperty() vigentes: number;
  @ApiProperty() proximas: number;
  @ApiProperty() caducadas: number;
  @ApiProperty() sinCaducidad: number;
}
