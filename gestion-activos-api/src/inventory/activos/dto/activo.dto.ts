import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { CategoriaDto } from '../../categorias/dto/categoria.dto.js';
import { CriticidadDto } from '../../criticidades/dto/criticidad.dto.js';

/** Activo tal como lo recibe el frontend: con su categoría y criticidad incluidas. */
export class ActivoDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'SRV-001' })
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos' })
  nombre: string;

  @ApiProperty({ example: 'ERP, Nómina' })
  sistemas: string;

  @ApiProperty({ example: 'Área de Infraestructura' })
  custodio: string;

  @ApiProperty({ example: 'Centro de datos - Rack 3' })
  ubicacion: string;

  @ApiProperty({ example: true })
  cifrado: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  ultimaRevision: Date;

  @ApiProperty({ example: 1 })
  categoriaId: number;

  @ApiProperty({ example: 3 })
  criticidadId: number;

  @ApiProperty({ type: CategoriaDto })
  categoria: CategoriaDto;

  @ApiProperty({ type: CriticidadDto })
  criticidad: CriticidadDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fecha de baja; null si el activo está vigente.',
  })
  deletedAt: Date | null;
}

export class PaginatedActivoDto extends PaginatedResponseDto(ActivoDto) {}
