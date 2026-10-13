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

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Computer #12',
    description:
      'Elemento de GLPI del que procede; null si se registró a mano. Lo gestiona la sincronización.',
  })
  origenGlpi: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '001',
    description: 'N.º de inventario tal como está en GLPI. Puede repetirse.',
  })
  numeroInventario: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '7-1-22-177',
    description: 'Código institucional original, sin corregir. Puede repetirse.',
  })
  codigoInstitucional: string | null;

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

  @ApiProperty({ type: String, nullable: true, example: '00330-80000-00000-AA990' })
  numeroSerie: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Bueno' })
  estado: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'ASUSTeK COMPUTER INC.' })
  fabricante: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Laptop' })
  tipo: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'ROG Zephyrus M16' })
  modelo: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'soporte' })
  tecnicoResponsable: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'LAN administrativa' })
  red: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'jperez' })
  contacto: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo se registró en el inventario de origen (GLPI).',
  })
  fechaAlta: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '10.0.5.21',
    description: 'Dato local: la sincronización con GLPI no lo modifica.',
  })
  direccionIp: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Dato local: la sincronización con GLPI no lo modifica.',
  })
  fechaCompra: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Características técnicas (texto largo, admite saltos de línea).',
  })
  comentario: string | null;

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

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Desde cuándo la sincronización lo considera No activo; null si sigue vigente en GLPI.',
  })
  inactivoDesde: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['PAPELERA_GLPI', 'AUSENTE_EN_GLPI'],
    description: 'Por qué pasó a No activo: está en la papelera de GLPI o ya no existe allí.',
  })
  motivoInactivo: string | null;
}

export class PaginatedActivoDto extends PaginatedResponseDto(ActivoDto) {}
