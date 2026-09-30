import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
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
}
