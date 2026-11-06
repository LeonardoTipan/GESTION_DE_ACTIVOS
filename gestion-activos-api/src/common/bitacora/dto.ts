import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { FRECUENCIAS_BITACORA, SITUACIONES_PERIODO, type FrecuenciaBitacora, type SituacionPeriodo } from './periodos.js';

/**
 * Contrato COMÚN de la Bitácora General de cada módulo, según «Indicadores de seguimiento
 * de Tecnología.xlsx»: el indicador (nombre, evidencia, fórmula y frecuencia del Excel) y,
 * por cada período del año, numerador, denominador y porcentaje. Solo lectura.
 */

export class QueryBitacoraIndicadorDto {
  @ApiProperty({ minimum: 2000, maximum: 2100, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;
}

/** Período opcional de una Bitácora Específica: año y número de período (mes, trimestre o semestre). */
export class QueryPeriodoBitacoraDto {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100, description: 'Año del período; sin él, todos los registros.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Mes (1–12), trimestre (1–4) o semestre (1–2) según la frecuencia del indicador; exige el año. Sin él, el año entero.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodo?: number;
}

export class IndicadorExcelDto {
  @ApiProperty({ example: 'Tasa de remediación de vulnerabilidades de seguridad' }) nombre: string;
  @ApiProperty({ example: 'Informe de vulnerabilidades remediadas aprobado' }) evidencia: string;
  @ApiProperty({ example: 'Vulnerabilidades remediadas / Total identificados' }) formula: string;
  @ApiProperty({ enum: FRECUENCIAS_BITACORA }) frecuencia: FrecuenciaBitacora;
  @ApiProperty({ example: 'Vulnerabilidades remediadas' }) numerador: string;
  @ApiProperty({ example: 'Total identificados' }) denominador: string;
  @ApiProperty({ description: 'Qué registros forman el numerador y el denominador (criterio aplicado).' }) criterio: string;
}

export class PeriodoIndicadorDto {
  @ApiProperty({ example: '2026-T1' }) clave: string;
  @ApiProperty({ example: 'T1 · ene–mar' }) etiqueta: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde: Date;
  @ApiProperty({ type: String, format: 'date-time', description: 'Excluido.' }) hasta: Date;
  @ApiProperty({ enum: SITUACIONES_PERIODO }) situacion: SituacionPeriodo;
  @ApiProperty({ type: Number, nullable: true, description: 'null en un período futuro.' }) numerador: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'null en un período futuro.' }) denominador: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'numerador ÷ denominador × 100 (1 decimal); null sin denominador (N/D).' })
  porcentaje: number | null;
}

/** Dato que acompaña al indicador sin formar parte de la fórmula (p. ej. las bajas de acceso). */
export class FilaInformativaDto {
  @ApiProperty({ example: 'Pruebas de restauración exitosas' }) etiqueta: string;
  @ApiProperty({ type: String, nullable: true }) descripcion: string | null;
  @ApiProperty({ type: 'array', items: { type: 'number', nullable: true }, description: 'Un valor por período, en el mismo orden; null en los futuros.' })
  valores: (number | null)[];
}

export class BitacoraIndicadorDto {
  @ApiProperty({ type: IndicadorExcelDto }) indicador: IndicadorExcelDto;
  @ApiProperty() anio: number;
  @ApiProperty({ type: [PeriodoIndicadorDto] }) periodos: PeriodoIndicadorDto[];
  @ApiProperty({ type: [FilaInformativaDto] }) informativas: FilaInformativaDto[];
}
