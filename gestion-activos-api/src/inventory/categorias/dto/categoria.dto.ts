import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Hardware', maxLength: 191 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  nombre: string;

  @ApiProperty({
    example: 'Equipos físicos: servidores, estaciones, periféricos.',
    maxLength: 191,
  })
  @Trim()
  @IsString()
  @MaxLength(191)
  descripcion: string;

  @ApiPropertyOptional({
    description: 'Control de acceso: sus activos admiten solicitudes de acceso LÓGICO (guardan o dan acceso a información). Falso si se omite.',
  })
  @IsOptional()
  @IsBoolean()
  admiteAccesoLogico?: boolean;

  @ApiPropertyOptional({
    description: 'Control de acceso: sus activos admiten solicitudes de acceso FÍSICO. Falso si se omite.',
  })
  @IsOptional()
  @IsBoolean()
  admiteAccesoFisico?: boolean;
}

/** En PATCH todos los campos son opcionales. */
export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto) {}

export class CategoriaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Hardware' })
  nombre: string;

  @ApiProperty({
    example: 'Equipos físicos: servidores, estaciones, periféricos.',
  })
  descripcion: string;

  @ApiProperty({ description: 'Elegible para solicitudes de acceso lógico.' })
  admiteAccesoLogico: boolean;

  @ApiProperty({ description: 'Elegible para solicitudes de acceso físico.' })
  admiteAccesoFisico: boolean;
}
