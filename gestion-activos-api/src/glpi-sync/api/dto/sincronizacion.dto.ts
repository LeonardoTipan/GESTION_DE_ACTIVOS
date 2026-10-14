import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export const ORIGENES_SINCRONIZACION = ['MANUAL', 'AUTOMATICA', 'CONSOLA'] as const;
export const MODOS_SINCRONIZACION = ['COMPLETA', 'INCREMENTAL'] as const;
export const ESTADOS_SINCRONIZACION = [
  'EN_CURSO',
  'EXITOSA',
  'CON_ERRORES',
  'FALLIDA',
] as const;
export const RESULTADOS_ELEMENTO = [
  'CREAR',
  'ENLAZAR',
  'ACTUALIZAR',
  'INACTIVAR',
  'REACTIVAR',
  'OMITIR',
  'ERROR',
] as const;

export class SincronizarDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'true = lectura COMPLETA con reconciliación de bajas (más lenta). ' +
      'Por defecto el botón solo trae lo modificado en GLPI desde la última sincronización.',
  })
  @IsOptional()
  @IsBoolean()
  completa?: boolean;
}

export class ContadoresSincronizacionDto {
  @ApiProperty({ example: 3, description: 'Elementos leídos de GLPI.' })
  leidos: number;

  @ApiProperty({ example: 1 })
  creados: number;

  @ApiProperty({ example: 2 })
  actualizados: number;

  @ApiProperty({ example: 0 })
  sinCambios: number;

  @ApiProperty({ example: 0, description: 'Pasaron a Dado de baja.' })
  inactivados: number;

  @ApiProperty({ example: 0 })
  reactivados: number;

  @ApiProperty({ example: 0 })
  omitidos: number;

  @ApiProperty({ example: 0 })
  errores: number;

  @ApiProperty({ example: 0, description: 'Elementos que requieren revisión manual.' })
  porRevisar: number;

  @ApiProperty({ example: 3, description: 'Cambios que GLPI traía.' })
  detectados: number;

  @ApiProperty({ example: 3, description: 'Cambios realmente escritos en la base.' })
  aplicados: number;
}

export class CambioSincronizacionDto {
  @ApiProperty({ example: 'Computer #12' })
  referencia: string;

  @ApiProperty({ type: Number, nullable: true, example: 5 })
  activoId: number | null;

  @ApiProperty({ example: '7-1-22-69' })
  codigo: string;

  @ApiProperty({ example: 'LP-CONTABILIDAD' })
  nombre: string;

  @ApiProperty({ enum: RESULTADOS_ELEMENTO })
  resultado: (typeof RESULTADOS_ELEMENTO)[number];

  @ApiProperty({ description: 'true = el cambio quedó escrito.' })
  aplicado: boolean;

  @ApiProperty({ type: [String], example: ['estado', 'ubicacion'] })
  campos: string[];

  @ApiProperty({ type: String, nullable: true })
  error: string | null;
}

/** Una ejecución registrada (sin el detalle de cambios). */
export class EjecucionDto {
  @ApiProperty({ example: 14 })
  id: number;

  @ApiProperty({ enum: ORIGENES_SINCRONIZACION })
  origen: (typeof ORIGENES_SINCRONIZACION)[number];

  @ApiProperty({ enum: MODOS_SINCRONIZACION })
  modo: (typeof MODOS_SINCRONIZACION)[number];

  @ApiProperty({ enum: ESTADOS_SINCRONIZACION })
  estado: (typeof ESTADOS_SINCRONIZACION)[number];

  @ApiProperty({ type: String, nullable: true, example: 'admin.test' })
  solicitadaPor: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  inicio: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fin: Date | null;

  @ApiProperty({ type: ContadoresSincronizacionDto })
  contadores: ContadoresSincronizacionDto;
}

/** Resultado de pulsar "Sincronizar con GLPI". */
export class ResultadoSincronizacionDto extends EjecucionDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Incremental: desde cuándo se pidieron los cambios a GLPI.',
  })
  desde: Date | null;

  @ApiProperty({
    description:
      'true = el punto de control avanzó. false = hubo errores y la próxima ejecución volverá a leer desde el anterior.',
  })
  puntoControlAvanzado: boolean;

  @ApiProperty({ type: [String], description: 'Problemas generales (conexión, lectura…).' })
  errores: string[];

  @ApiProperty({ type: [CambioSincronizacionDto] })
  cambios: CambioSincronizacionDto[];
}

export class EstadoSincronizacionDto {
  @ApiProperty({ description: 'false = faltan las variables de GLPI en el servidor.' })
  configurado: boolean;

  @ApiProperty({ description: 'true = hay una sincronización escribiendo ahora mismo.' })
  enCurso: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo terminó la última sincronización sin errores.',
  })
  ultimaExitosa: Date | null;

  @ApiProperty({ type: EjecucionDto, nullable: true, description: 'La ejecución más reciente.' })
  ultima: EjecucionDto | null;
}
