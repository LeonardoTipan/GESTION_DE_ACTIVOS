import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

/** Capa 1: ALCANCE. Qué se respalda y de qué activo. */
export class CreateRespaldoDto {
  @ApiProperty({ example: 5, description: 'ID de un activo vigente.' })
  @IsInt()
  @Min(1)
  activoId: number;

  @ApiProperty({
    example: 'Base de datos ERP completa + archivos de configuración',
    maxLength: 191,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  alcanceDetalle: string;
}

/** Capa 2: EJECUCIÓN. Solo se registra una vez, mientras está PENDIENTE. */
export class RegistrarEjecucionDto {
  @ApiProperty({ enum: ['EXITOSA', 'FALLIDA'] })
  @IsIn(['EXITOSA', 'FALLIDA'])
  estadoEjecucion: 'EXITOSA' | 'FALLIDA';

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-30T02:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaEjecucion no puede estar en el futuro',
  })
  fechaEjecucion: Date;

  @ApiProperty({
    example: '\\\\nas01\\respaldos\\erp\\2026-09-30.log',
    maxLength: 191,
    description: 'URL o ruta de red donde está la evidencia (log, captura...).',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  rutaEvidencia: string;
}

/** Capa 3: RESTAURACIÓN / PRUEBA. Solo tras una ejecución EXITOSA. */
export class RegistrarPruebaDto {
  @ApiProperty({ enum: ['APROBADA', 'FALLIDA'] })
  @IsIn(['APROBADA', 'FALLIDA'])
  estadoPrueba: 'APROBADA' | 'FALLIDA';

  @ApiProperty({
    example:
      'Restauración completa en entorno de pruebas en 42 min; datos íntegros.',
    maxLength: 191,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  resultadoPrueba: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-30T10:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, {
    message: 'fechaPrueba no puede estar en el futuro',
  })
  fechaPrueba: Date;
}
