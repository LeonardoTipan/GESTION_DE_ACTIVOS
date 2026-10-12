import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
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

  @ApiPropertyOptional({ example: '00330-80000-00000-AA990', maxLength: 191 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  numeroSerie?: string;

  @ApiPropertyOptional({
    example: 'Bueno',
    maxLength: 191,
    description: 'Estado físico u operativo del activo.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  estado?: string;

  @ApiPropertyOptional({ example: 'ASUSTeK COMPUTER INC.', maxLength: 191 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  fabricante?: string;

  @ApiPropertyOptional({ example: 'Laptop', maxLength: 191, description: 'Tipo de equipo.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  tipo?: string;

  @ApiPropertyOptional({ example: 'ROG Zephyrus M16', maxLength: 191 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  modelo?: string;

  @ApiPropertyOptional({ example: 'soporte', maxLength: 191, description: 'Técnico a cargo del soporte.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  tecnicoResponsable?: string;

  @ApiPropertyOptional({ example: 'LAN administrativa', maxLength: 191, description: 'Red a la que se conecta.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  red?: string;

  @ApiPropertyOptional({ example: 'jperez', maxLength: 191, description: 'Persona o usuario de contacto.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(191)
  contacto?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-05-11T18:56:57.000Z',
    description: 'Cuándo se registró en el inventario de origen.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaAlta?: Date;

  @ApiPropertyOptional({
    example: 'Memoria RAM 64 GB\nCapacidad de disco 1 TB',
    maxLength: 5000,
    description: 'Características técnicas (admite saltos de línea).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comentario?: string;

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
