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
import {
  EstadoVulnerabilidad,
  NivelRiesgo,
} from '../../../generated/prisma/enums.js';

/** En la query string todo llega como texto: "true"/"false" → boolean. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class QueryVulnerabilidadesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activoId?: number;

  @ApiPropertyOptional({ enum: NivelRiesgo })
  @IsOptional()
  @IsEnum(NivelRiesgo)
  nivelRiesgo?: NivelRiesgo;

  @ApiPropertyOptional({ enum: EstadoVulnerabilidad })
  @IsOptional()
  @IsEnum(EstadoVulnerabilidad)
  estado?: EstadoVulnerabilidad;

  @ApiPropertyOptional({
    example: 'CVE-2026',
    description: 'Busca por CVE (coincidencia parcial).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  cve?: string;

  @ApiPropertyOptional({
    description:
      'true = solo pendientes (ABIERTA o EN_MITIGACION); false = solo cerradas.',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  abiertas?: boolean;

  @ApiPropertyOptional({
    description:
      'true = solo pendientes con fecha límite ya pasada (SLA incumplido); false = excluirlas.',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  vencidas?: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Sincronización incremental: solo vulnerabilidades modificadas después de esta fecha.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;
}
