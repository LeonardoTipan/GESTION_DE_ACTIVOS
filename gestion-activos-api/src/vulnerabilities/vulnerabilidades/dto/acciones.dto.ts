import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MotivoCambioDto } from '../../../audit/dto/traza.dto.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { NivelRiesgo } from '../../../generated/prisma/enums.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

/** Formato oficial: CVE-<año de 4 dígitos>-<número de 4 o más dígitos>. */
export const FORMATO_CVE = /^CVE-\d{4}-\d{4,}$/;

/** Los campos TEXT admiten mucho más; 5000 caracteres es un tope razonable para la API. */
const MAX_TEXTO_LARGO = 5000;

// ── Fase 1 · Detección ──────────────────────────────────────────────────────

/** Detección: crea la vulnerabilidad en estado ABIERTO. */
export class RegistrarVulnerabilidadDto {
  @ApiProperty({ example: 5, description: '«Sistema»: ID de un activo operativo de GLPI.' })
  @IsInt()
  @Min(1)
  activoId: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-01-25T14:00:00.000Z',
    description: '«Fecha Detección»: cuándo se identificó (puede ser histórica; no futura). No es la fecha de registro.',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fecha no puede estar en el futuro' })
  fecha: Date;

  @ApiProperty({
    example: 'Sistema operativo desactualizado',
    maxLength: MAX_TEXTO_LARGO,
    description: '«Vulnerabilidad»: descripción del problema detectado.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXTO_LARGO)
  descripcion: string;

  @ApiProperty({ enum: NivelRiesgo, example: 'ALTO', description: '«Criticidad»: CRITICO, ALTO, MEDIO o BAJO.' })
  @IsEnum(NivelRiesgo)
  nivelRiesgo: NivelRiesgo;

  @ApiProperty({ example: 'ANALISTA 1', description: '«Responsable»: persona encargada de gestionarla.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiPropertyOptional({
    example: 'CVE-2026-12345',
    description: 'Identificador público opcional (se normaliza a mayúsculas).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsString()
  @Matches(FORMATO_CVE, {
    message: 'cve debe tener el formato CVE-AAAA-NNNN (p. ej. CVE-2026-12345)',
  })
  cve?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-04-30T23:59:59.000Z',
    description: 'Plazo opcional para remediarla. No puede ser anterior a la detección.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaLimite?: Date;
}

/** La misma vulnerabilidad detectada en varios activos: un registro por activo, o ninguno. */
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

/**
 * Corrección de los datos de Detección (fecha, descripción, criticidad, responsable,
 * CVE, plazo) mientras está pendiente. Exige motivo: queda en la auditoría.
 */
export class EditarVulnerabilidadDto extends IntersectionType(
  PartialType(OmitType(RegistrarVulnerabilidadDto, ['activoId'] as const)),
  MotivoCambioDto,
) {}

// ── Fase 2 · Remediación ────────────────────────────────────────────────────

/** ABIERTO → EN_PROGRESO. */
export class IniciarRemediacionDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Cuándo empezó realmente el trabajo (opcional; no futura, no anterior a la detección).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fechaInicio no puede estar en el futuro' })
  fechaInicio?: Date;
}

/** Datos de la remediación. Se pueden guardar sin cerrar (no remedia por sí solo). */
export class DatosRemediacionDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-04-27T15:00:00.000Z',
    description: '«Fecha de Remediación»: cuándo se solucionó REALMENTE (la indica el usuario; puede ser histórica, no futura, no anterior a la detección).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fechaRemediacion no puede estar en el futuro' })
  fechaRemediacion?: Date;

  @ApiPropertyOptional({
    example: 'Informe de Mitigación de Amenazas y Vulnerabilidades 01',
    description: '«Verificable»: nombre del informe o documento que prueba la remediación.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({
    example: 'Carpeta Compartida TICs/Vulnerabilidades/2026',
    description: '«Repositorio Verificable»: carpeta compartida o URL http(s) donde está la evidencia.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({ description: '«Observación»: acciones realizadas, detalles técnicos, limitaciones.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  observacion?: string;
}

/**
 * Guardar o corregir los datos de remediación. Pendiente: admin y analista, sin
 * motivo obligatorio. Ya REMEDIADO: solo admin y con motivo.
 */
export class ActualizarRemediacionDto extends DatosRemediacionDto {
  @ApiPropertyOptional({ description: 'Obligatorio si la vulnerabilidad ya está REMEDIADA (mínimo 20 caracteres).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  motivoCambio?: string;
}

/**
 * → REMEDIADO. Exige la fecha REAL de remediación, el verificable y su repositorio
 * (la evidencia se comprueba aquí: no hay una fase de verificación aparte).
 */
export class RemediarDto extends DatosRemediacionDto {
  @ApiProperty({ type: String, format: 'date-time', example: '2026-04-27T15:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fechaRemediacion no puede estar en el futuro' })
  declare fechaRemediacion: Date;

  @ApiProperty({ example: 'Informe de Mitigación de Amenazas y Vulnerabilidades 01' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'El verificable es obligatorio para remediar.' })
  @MaxLength(191)
  declare evidencia: string;

  @ApiProperty({ example: 'Carpeta Compartida TICs/Vulnerabilidades/2026' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'El repositorio del verificable es obligatorio para remediar.' })
  @MaxLength(191)
  declare repositorioVerificable: string;
}

/** REMEDIADO → EN_PROGRESO: la vulnerabilidad persiste o reapareció. */
export class ReabrirDto {
  @ApiProperty({ example: 'El escaneo de mayo vuelve a detectar la versión vulnerable del sistema operativo.' })
  @Trim()
  @IsString()
  @MinLength(20, { message: 'El motivo debe tener al menos 20 caracteres.' })
  @MaxLength(MAX_TEXTO_LARGO)
  motivo: string;
}
