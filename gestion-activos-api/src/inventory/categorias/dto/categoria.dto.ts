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

  @ApiPropertyOptional({ description: 'Sus activos (operativos) se pueden planificar y ejecutar en Mantenimientos. Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaMantenimiento?: boolean;

  @ApiPropertyOptional({ description: 'Sus activos (operativos) admiten vulnerabilidades, sean hardware o software. Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaVulnerabilidad?: boolean;

  @ApiPropertyOptional({ description: 'Sus activos (operativos) admiten renovaciones (licencias, garantías, certificados, contratos). Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaRenovacion?: boolean;

  @ApiPropertyOptional({ description: 'Sus activos (operativos) son sistemas elegibles en Evaluación de Sistemas Productivos. Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaEvaluacion?: boolean;

  @ApiPropertyOptional({ description: 'Sus activos (operativos) son equipos sujetos a Protección de Endpoints. Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaEndpoint?: boolean;

  @ApiPropertyOptional({ description: 'Sus activos (operativos) admiten planes de respaldo. Falso si se omite.' })
  @IsOptional()
  @IsBoolean()
  aplicaRespaldo?: boolean;
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

  @ApiProperty({ description: 'Elegible en Mantenimientos.' })
  aplicaMantenimiento: boolean;

  @ApiProperty({ description: 'Elegible en Vulnerabilidades.' })
  aplicaVulnerabilidad: boolean;

  @ApiProperty({ description: 'Elegible en Renovaciones.' })
  aplicaRenovacion: boolean;

  @ApiProperty({ description: 'Elegible en Evaluación de Sistemas Productivos.' })
  aplicaEvaluacion: boolean;

  @ApiProperty({ description: 'Elegible en Protección de Endpoints.' })
  aplicaEndpoint: boolean;

  @ApiProperty({ description: 'Elegible en Respaldos.' })
  aplicaRespaldo: boolean;
}
