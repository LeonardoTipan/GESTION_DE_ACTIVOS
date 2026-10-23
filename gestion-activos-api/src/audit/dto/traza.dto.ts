import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import {
  NOMBRES_ENTIDAD,
  type AccionTraza,
  type CambioCampo,
  type Entidad,
} from '../trazas.service.js';

/** Mínimo exigido al motivo de una modificación, anulación o reversión. */
export const MOTIVO_MINIMO = 20;

/** Cuerpo de anular y reversar. */
export class MotivoDto {
  @ApiProperty({
    minLength: MOTIVO_MINIMO,
    maxLength: 300,
    example: 'Registro duplicado por error de digitación; consta en el acta PR-10/2026.',
    description: 'Por qué se hace, y la evidencia que lo respalda.',
  })
  @Trim()
  @IsString()
  @MinLength(MOTIVO_MINIMO, {
    message: `El motivo debe tener al menos ${MOTIVO_MINIMO} caracteres.`,
  })
  @MaxLength(300)
  motivo: string;
}

/** Motivo obligatorio de toda modificación (se conserva la versión anterior). */
export class MotivoCambioDto {
  @ApiProperty({
    minLength: MOTIVO_MINIMO,
    maxLength: 300,
    description: 'Por qué se modifica el registro y la evidencia que lo respalda.',
  })
  @Trim()
  @IsString()
  @MinLength(MOTIVO_MINIMO, {
    message: `El motivo del cambio debe tener al menos ${MOTIVO_MINIMO} caracteres.`,
  })
  @MaxLength(300)
  motivoCambio: string;
}

export class QueryTrazasDto {
  @ApiProperty({ enum: NOMBRES_ENTIDAD })
  @IsIn(NOMBRES_ENTIDAD)
  entidad: Entidad;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  registroId: number;
}

export class CambioCampoDto implements CambioCampo {
  @ApiProperty({ example: 'medio', description: '"__estado_registro" en anulaciones y reversiones.' })
  campo: string;

  @ApiProperty({ example: 'CINTA_LTO8' })
  antes: unknown;

  @ApiProperty({ example: 'NUBE_INMUTABLE' })
  despues: unknown;
}

export class TrazaDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: NOMBRES_ENTIDAD })
  entidad: Entidad;

  @ApiProperty()
  registroId: number;

  @ApiProperty({ description: 'Versión del registro ANTES del cambio.' })
  version: number;

  @ApiProperty({ enum: ['REGISTRAR', 'MODIFICAR', 'ANULAR', 'REVERSAR'] })
  accion: AccionTraza;

  @ApiProperty()
  motivo: string;

  @ApiProperty({ type: [CambioCampoDto] })
  cambios: CambioCampo[];

  @ApiProperty({ example: 'admin.test' })
  responsable: string;

  @ApiProperty({ type: String, format: 'date-time' })
  fecha: Date;
}
