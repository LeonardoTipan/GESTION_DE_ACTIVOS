import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Trim } from '../common/decorators/trim.decorator.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ActivoBreveDto, RegistroDto, aBooleano } from '../common/dto/registro.dto.js';
import { EstadoPeriodoEndpoint } from '../generated/prisma/enums.js';

/** Fase 1 · apertura del período mensual. Los datos de la fase 2 van en DatosRegistroPeriodoDto. */
export class AbrirPeriodoDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-15T13:00:00.000Z',
    description: 'Fecha PLANIFICADA de la medición. Año, mes y semestre se derivan de ella (hora de la institución); del mes en curso o de uno anterior.',
  })
  @Type(() => Date)
  @IsDate()
  fechaPlanificada: Date;

  @ApiProperty({ example: 'Soporte TIC', description: 'Persona encargada del período.' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsable: string;

  @ApiPropertyOptional({ example: 'Corte con el inventario de GLPI del último día hábil.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observacion?: string;
}

/** El antivirus de un equipo del período. */
export class EquipoPeriodoDto {
  @ApiProperty({ example: 12 }) @Type(() => Number) @IsInt() @Min(1) activoId: number;
  @ApiProperty({ description: 'true = tiene antivirus/EDR activo.' }) @IsBoolean() conAntivirus: boolean;
}

/** Un equipo del período, con su activo real del inventario. */
export class EquipoPeriodoDetalleDto {
  @ApiProperty() activoId: number;
  @ApiProperty({ type: Boolean, nullable: true, description: 'null = aún sin registrar.' }) conAntivirus: boolean | null;
  @ApiProperty({ type: ActivoBreveDto }) activo: ActivoBreveDto;
}

/**
 * Los equipos del período (copiados al abrirlo) frente a los elegibles HOY. Solo informa: el
 * período nunca cambia su lista por sí solo.
 */
export class ComparacionInventarioDto {
  @ApiProperty({ description: 'Equipos del período (su fotografía del inventario al abrirlo).' }) equiposPeriodo: number;
  @ApiProperty({ description: 'Equipos elegibles hoy (operativos de categorías con Endpoints).' }) elegiblesHoy: number;
  @ApiProperty({ type: [ActivoBreveDto], description: 'Elegibles hoy que no están en el período (p. ej., incorporados a GLPI después de abrirlo).' })
  nuevos: ActivoBreveDto[];
  @ApiProperty({ type: [ActivoBreveDto], description: 'Del período, que hoy ya no son elegibles (baja, fuera de GLPI o de otra categoría). Se conservan.' })
  yaNoElegibles: ActivoBreveDto[];
}

/**
 * Fase 2 · registro y cierre del mes. Todo opcional al guardar avance; al cerrar se exigen los
 * dos totales, el verificable y el repositorio. Los totales los digita el técnico según el
 * inventario real: el número de equipos que ve la aplicación es solo una referencia.
 */
export class DatosRegistroPeriodoDto {
  @ApiPropertyOptional({ type: [EquipoPeriodoDto], description: 'Con detalle por equipo: el antivirus de cada equipo enviado (los demás se conservan). Los totales se calculan.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => EquipoPeriodoDto)
  equipos?: EquipoPeriodoDto[];

  @ApiPropertyOptional({ example: 26, minimum: 1, description: 'Solo en períodos SIN detalle por equipo (anteriores): total de equipos sujetos al control.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  totalActivos?: number;

  @ApiPropertyOptional({ example: 25, minimum: 0, description: 'Solo en períodos SIN detalle por equipo: equipos con antivirus/EDR activo; no puede superar el total.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  equiposConAntivirus?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Fecha REAL en que se hizo la medición: la indica el usuario (no futura, no anterior al mes del período).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaEjecucion?: Date;

  @ApiPropertyOptional({ example: 'Soporte TIC · J. Pérez', description: 'Quién realizó la medición del mes.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  responsableEjecucion?: string;

  @ApiPropertyOptional({
    example: 'Inventario de equipos octubre 2026.xlsx',
    description: '«Verificable»: nombre del archivo Excel del inventario de equipos del mes (la aplicación no guarda archivos).',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  evidencia?: string;

  @ApiPropertyOptional({ example: 'Carpeta Compartida TICs/Antivirus', description: '«Repositorio Verificable»: carpeta o URL http(s).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  repositorioVerificable?: string;

  @ApiPropertyOptional({ example: 'Un equipo en reparación sin antivirus.', description: 'Observación del período (la de la apertura, ampliada).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  observacion?: string;
}

export class ReabrirPeriodoDto {
  @ApiProperty({ example: 'El inventario del mes tenía equipos duplicados: hay que corregir el total.' })
  @Trim()
  @IsString()
  @MinLength(20, { message: 'El motivo debe tener al menos 20 caracteres.' })
  @MaxLength(2000)
  motivo: string;
}

export class QueryPeriodosDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @ApiPropertyOptional({ enum: EstadoPeriodoEndpoint })
  @IsOptional()
  @IsEnum(EstadoPeriodoEndpoint)
  estado?: EstadoPeriodoEndpoint;

  @ApiPropertyOptional({ example: 'octubre 2026', description: 'Búsqueda por año y/o mes: «2026», «oct», «octubre 2026», «10».' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Responsable asignado o responsable de la ejecución (contiene el texto).' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  responsable?: string;

  @ApiPropertyOptional({ description: 'true = solo pendientes de ejecutar o cerrar (ABIERTO o EN_PROGRESO).' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  pendientes?: boolean;

  @ApiPropertyOptional({ description: 'Código o nombre de un equipo del período.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  activo?: string;

  @ApiPropertyOptional({ description: 'Períodos con algún equipo de esta categoría.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ default: false, description: 'true = incluye los anulados (por defecto se ocultan).' })
  @IsOptional()
  @aBooleano()
  @IsBoolean()
  incluirAnulados?: boolean;
}

export class PeriodoEndpointDto extends RegistroDto {
  @ApiProperty() id: number;
  @ApiProperty() anio: number;
  @ApiProperty({ description: '1 = enero … 12 = diciembre. Derivado de la fecha planificada.' }) mes: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha planificada. Vacía en los períodos anteriores a ella.' })
  fechaPlanificada: Date | null;
  @ApiProperty({ example: 'S1-2026', description: 'Calculado del mes.' }) semestre: string;
  @ApiProperty({ description: 'Tiene detalle por equipo: los totales se calculan de él.' }) conDetalle: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'Con detalle: equipos aún sin registrar.' }) equiposSinRegistrar: number | null;
  @ApiProperty({ description: 'Abierto y con la fecha planificada (o su mes) ya pasada.' }) porEjecutar: boolean;
  @ApiProperty() responsable: string;
  @ApiProperty({ type: String, nullable: true }) observacion: string | null;
  @ApiProperty({ enum: EstadoPeriodoEndpoint }) estado: EstadoPeriodoEndpoint;
  // Fase 2
  @ApiProperty({ type: Number, nullable: true }) totalActivos: number | null;
  @ApiProperty({ type: Number, nullable: true }) equiposConAntivirus: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha real de la medición.' }) fechaEjecucion: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Quién realizó la medición.' }) responsableEjecucion: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Verificable».' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true, description: '«Repositorio Verificable».' }) repositorioVerificable: string | null;
  @ApiProperty({ type: String, nullable: true }) cerradoPor: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Calculada (no se guarda): equipos con antivirus ÷ total × 100, con 1 decimal.' })
  cobertura: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Calculado: total − con antivirus.' }) equiposSinAntivirus: number | null;
}

export class PaginatedPeriodoEndpointDto extends PaginatedResponseDto(PeriodoEndpointDto) {}
