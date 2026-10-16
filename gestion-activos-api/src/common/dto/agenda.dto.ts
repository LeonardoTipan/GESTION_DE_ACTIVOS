import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ActivoBreveDto } from './registro.dto.js';

export const CAPAS = [1, 2, 3] as const;
export type Capa = (typeof CAPAS)[number];

/** PREVISTO = lo planificado (un intervalo o un límite); REAL = lo que ocurrió. */
export const TIPOS_EVENTO = ['PREVISTO', 'REAL'] as const;

/**
 * Estado del evento en el calendario:
 * PROGRAMADO (aún en plazo) · VENCIDO (pasó el límite sin hacerse) · EN_CURSO ·
 * COMPLETADO · FALLIDO (o no satisfactorio, o persiste) · CANCELADO.
 */
export const ESTADOS_EVENTO = ['PROGRAMADO', 'VENCIDO', 'EN_CURSO', 'COMPLETADO', 'FALLIDO', 'CANCELADO'] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export class EventoAgendaDto {
  @ApiProperty({ example: 'mant-ejecucion-12', description: 'Único en la respuesta.' })
  clave: string;

  @ApiProperty({ enum: ['respaldos', 'mantenimientos', 'vulnerabilidades'] })
  modulo: 'respaldos' | 'mantenimientos' | 'vulnerabilidades';

  @ApiProperty({ enum: CAPAS, description: '1 planificación · 2 ejecución o tratamiento · 3 verificación o restauración.' })
  capa: Capa;

  @ApiProperty({ enum: TIPOS_EVENTO })
  tipo: (typeof TIPOS_EVENTO)[number];

  @ApiProperty({ example: 'Mantenimiento preventivo' })
  titulo: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Inicio previsto, o la fecha real.' })
  inicio: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Límite previsto, o el fin real.' })
  fin: Date | null;

  @ApiProperty({ enum: ESTADOS_EVENTO })
  estado: EstadoEvento;

  @ApiProperty({ description: 'Se registró fuera del intervalo previsto, como excepción.' })
  fueraDePlazo: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'jperez' })
  responsable: string | null;

  @ApiProperty({ type: ActivoBreveDto })
  activo: ActivoBreveDto;

  @ApiProperty({ example: '/mantenimientos/12', description: 'Ruta del registro en la aplicación.' })
  ruta: string;

  @ApiProperty({ type: String, example: 'Ventana nocturna 22:00–02:00', nullable: true })
  detalle: string | null;
}

export class QueryAgendaDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  desde: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  hasta: Date;

  @ApiPropertyOptional({ enum: CAPAS, description: 'Sin capa: las tres.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsIn(CAPAS)
  capa?: Capa;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ description: 'Contiene (responsable o técnico).' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  responsable?: string;

  @ApiPropertyOptional({ enum: ESTADOS_EVENTO })
  @IsOptional()
  @IsIn(ESTADOS_EVENTO)
  estado?: EstadoEvento;
}

/** Excepción de plazo: la justificación, solo para un admin. */
export class ExcepcionPlazoDto {
  @ApiPropertyOptional({
    description: 'Si la fecha real cae fuera del intervalo previsto: justificación (solo admin).',
    minLength: 20,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  motivoExcepcion?: string;
}

/** Ampliación formal de un plazo (solo admin): el nuevo límite y por qué. */
export class AmpliarPlazoDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  nuevoLimite: Date;

  @ApiProperty({ minLength: 20 })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  motivo: string;
}

/** Programar la ventana de la capa 3 (verificación o prueba de restauración). */
export class ProgramarVerificacionDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  prevista: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  limite: Date;
}
