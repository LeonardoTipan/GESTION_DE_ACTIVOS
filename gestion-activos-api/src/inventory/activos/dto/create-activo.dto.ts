import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateActivoDto {
  @ApiProperty({
    example: 'SRV-001',
    maxLength: 191,
    description: 'Código único del activo.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos', maxLength: 191 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  nombre: string;

  @ApiProperty({
    example: 'ERP, Nómina',
    maxLength: 191,
    description: 'Sistemas que soporta o aloja.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  sistemas: string;

  @ApiProperty({
    example: 'Área de Infraestructura',
    maxLength: 191,
    description: 'Responsable de su custodia.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  custodio: string;

  @ApiProperty({ example: 'Centro de datos - Rack 3', maxLength: 191 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  ubicacion: string;

  @ApiProperty({
    example: true,
    description: '¿La información del activo está cifrada?',
  })
  @IsBoolean()
  cifrado: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-15T00:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  ultimaRevision: Date;

  @ApiProperty({
    example: 1,
    description: 'ID de la categoría (GET /api/categorias).',
  })
  @IsInt()
  @Min(1)
  categoriaId: number;

  @ApiProperty({
    example: 3,
    description: 'ID del nivel de criticidad (GET /api/criticidades).',
  })
  @IsInt()
  @Min(1)
  criticidadId: number;
}

/** En PATCH todos los campos son opcionales: solo se modifica lo enviado. */
export class UpdateActivoDto extends PartialType(CreateActivoDto) {}
