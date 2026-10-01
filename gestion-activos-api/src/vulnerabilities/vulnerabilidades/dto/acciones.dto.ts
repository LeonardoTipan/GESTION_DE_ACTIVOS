import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { NivelRiesgo } from '../../../generated/prisma/enums.js';

/** Margen para diferencias de reloj entre el equipo del usuario y el servidor. */
const AHORA_CON_MARGEN = () => new Date(Date.now() + 5 * 60 * 1000);

/** Formato oficial: CVE-<año de 4 dígitos>-<número de 4 o más dígitos>. */
export const FORMATO_CVE = /^CVE-\d{4}-\d{4,}$/;

/** Los campos TEXT admiten mucho más; 5000 caracteres es un tope razonable para la API. */
const MAX_TEXTO_LARGO = 5000;

/** Registrar: crea la vulnerabilidad en estado ABIERTA. */
export class RegistrarVulnerabilidadDto {
  @ApiProperty({ example: 5, description: 'ID de un activo vigente.' })
  @IsInt()
  @Min(1)
  activoId: number;

  @ApiPropertyOptional({
    example: 'CVE-2026-12345',
    description: 'Identificador público (se normaliza a mayúsculas).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(FORMATO_CVE, {
    message: 'cve debe tener el formato CVE-AAAA-NNNN (p. ej. CVE-2026-12345)',
  })
  cve?: string;

  @ApiProperty({
    example:
      'OpenSSL 3.0.x vulnerable a desbordamiento de búfer en la verificación de certificados X.509.',
    maxLength: MAX_TEXTO_LARGO,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXTO_LARGO)
  descripcion: string;

  @ApiProperty({ enum: NivelRiesgo, example: 'ALTO' })
  @IsEnum(NivelRiesgo)
  nivelRiesgo: NivelRiesgo;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-30T09:00:00.000Z',
    description: 'Fecha de detección (no puede ser futura).',
  })
  @Type(() => Date)
  @IsDate()
  @MaxDate(AHORA_CON_MARGEN, { message: 'fecha no puede estar en el futuro' })
  fecha: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-10-15T23:59:59.000Z',
    description:
      'Plazo para remediarla (SLA). No puede ser anterior a la detección.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaLimite?: Date;
}

/** Mitigar: EN_MITIGACION → MITIGADA. */
export class MitigarVulnerabilidadDto {
  @ApiProperty({
    example:
      'Actualizado OpenSSL a 3.0.15 y reiniciado el servicio; verificado con escaneo.',
    maxLength: MAX_TEXTO_LARGO,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXTO_LARGO)
  mitigacion: string;
}

/** Aceptar riesgo (solo admin): ABIERTA o EN_MITIGACION → ACEPTADA. */
export class AceptarRiesgoDto {
  @ApiProperty({
    example:
      'Sistema heredado sin parche del fabricante; aislado en VLAN sin acceso a Internet. Se reevalúa en 6 meses.',
    maxLength: MAX_TEXTO_LARGO,
    description: 'Justificación formal (se guarda en "mitigacion").',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXTO_LARGO)
  justificacion: string;
}
