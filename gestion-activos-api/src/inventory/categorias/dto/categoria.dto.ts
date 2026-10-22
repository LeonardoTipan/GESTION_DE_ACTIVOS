import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClaseMantenimiento } from '../../../generated/prisma/enums.js';
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

  @ApiPropertyOptional({
    enum: ClaseMantenimiento,
    nullable: true,
    description: 'Mantenimiento: HARDWARE (preventivo, correctivo, predictivo) o SOFTWARE (preventivo, correctivo, perfectivo, adaptativo, evolutivo). null = sin clasificar: solo preventivo y correctivo.',
  })
  @IsOptional()
  @IsEnum(ClaseMantenimiento)
  claseMantenimiento?: ClaseMantenimiento | null;
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

  @ApiProperty({ enum: ClaseMantenimiento, nullable: true, description: 'Clase para los tipos de mantenimiento; null = sin clasificar.' })
  claseMantenimiento: ClaseMantenimiento | null;
}
