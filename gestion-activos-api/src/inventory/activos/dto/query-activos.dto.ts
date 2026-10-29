import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { APLICACIONES, type Aplicacion } from '../aplicacion.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export const CAMPOS_ORDEN_ACTIVOS = [
  'codigo',
  'nombre',
  'custodio',
  'ubicacion',
  'ultimaRevision',
  'createdAt',
  'updatedAt',
] as const;
export type CampoOrdenActivos = (typeof CAMPOS_ORDEN_ACTIVOS)[number];

/** Claves reservadas del filtro por estado (no son valores de GLPI). */
export const ESTADO_BAJA = '@baja';
export const ESTADO_SIN_ESTADO = '@sin-estado';

/** En la query string todo llega como texto: "true"/"false" → boolean. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class QueryActivosDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca en código, nombre, custodio y ubicación.',
    example: 'servidor',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  criticidadId?: number;

  @ApiPropertyOptional({
    description: 'Filtra por activos cifrados (true) o sin cifrar (false).',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  cifrado?: boolean;

  @ApiPropertyOptional({ enum: CAMPOS_ORDEN_ACTIVOS, default: 'codigo' })
  @IsOptional()
  @IsIn(CAMPOS_ORDEN_ACTIVOS)
  sort: CampoOrdenActivos = 'codigo';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Sincronización incremental: solo activos modificados DESPUÉS de esta fecha. ' +
      'Incluye los dados de baja (deletedAt ≠ null) para que el frontend los retire.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  actualizadoDesde?: Date;

  @ApiPropertyOptional({
    example: 'Bueno',
    description:
      'Filtra por el estado EXACTO del activo, tal como lo informa GLPI (Bueno, Regular, Malo…). ' +
      'Los valores disponibles se consultan en GET /activos/estados. Claves especiales: ' +
      '"@baja" (dado de baja: a mano, en la papelera de GLPI o ya inexistente allí) y "@sin-estado".',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  estado?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'true = solo equipos OPERATIVOS: ni dados de baja ni en un estado de la lista ' +
      'ESTADOS_NO_OPERATIVOS. Es lo que usan los selectores de respaldos, mantenimientos y vulnerabilidades.',
  })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  operativos: boolean = false;

  @ApiPropertyOptional({
    enum: APLICACIONES,
    description:
      'Solo activos cuya categoría está habilitada para ese módulo (Catálogos > Categorías). ' +
      'Lo usan los selectores de Mantenimientos, Vulnerabilidades y Renovaciones, junto con operativos=true.',
  })
  @IsOptional()
  @IsIn(APLICACIONES)
  aplica?: Aplicacion;
}
