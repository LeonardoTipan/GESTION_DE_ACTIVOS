import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { EstadoVulnerabilidad, NivelRiesgo } from '../../../generated/prisma/enums.js';

/** En la query string todo llega como texto: "true"/"false" → boolean. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class QueryVulnerabilidadesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5, description: '«Sistema»: activo de GLPI.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ enum: NivelRiesgo, description: '«Criticidad».' })
  @IsOptional()
  @IsEnum(NivelRiesgo)
  nivelRiesgo?: NivelRiesgo;

  @ApiPropertyOptional({ example: 7, description: 'Categoría del activo.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ description: 'Busca en el código y nombre del activo, la descripción y el CVE.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: '«Responsable» (contiene el texto).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  responsable?: string;

  @ApiPropertyOptional({ enum: EstadoVulnerabilidad, description: '«Estado».' })
  @IsOptional()
  @IsEnum(EstadoVulnerabilidad)
  estado?: EstadoVulnerabilidad;

  @ApiPropertyOptional({ example: 'CVE-2026', description: 'Busca por CVE (coincidencia parcial).' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  cve?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Detectadas desde esta fecha (incluida).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Detectadas hasta esta fecha (incluida).' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hasta?: Date;

  @ApiPropertyOptional({ description: 'true = solo pendientes (ABIERTO o EN_PROGRESO); false = solo remediadas.' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  abiertas?: boolean;

  @ApiPropertyOptional({ description: 'true = solo pendientes con la fecha límite ya pasada; false = excluirlas.' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  vencidas?: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Sincronización incremental: solo vulnerabilidades modificadas después de esta fecha.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;

  @ApiPropertyOptional({
    default: true,
    description: 'false = oculta los anulados (por defecto se muestran, marcados).',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  incluirAnulados: boolean = true;
}
