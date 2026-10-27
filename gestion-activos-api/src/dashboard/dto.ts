import { ApiProperty } from '@nestjs/swagger';

/** Trámites pendientes por módulo (ver docs/dashboard-pendientes.md). */
export class PendientesTableroDto {
  @ApiProperty({ example: 3, description: 'Control de acceso: ABIERTO + PENDIENTE (en gestión)' })
  accesos!: number;

  @ApiProperty({ example: 1, description: 'Mantenimientos: PROGRAMADO + EN_EJECUCION, no anulados' })
  mantenimientos!: number;

  @ApiProperty({ example: 0, description: 'Vulnerabilidades: ABIERTO + EN_PROGRESO, no anuladas' })
  vulnerabilidades!: number;

  @ApiProperty({ example: 2, description: 'Renovaciones: ABIERTO + EN_PROGRESO, no anuladas' })
  renovaciones!: number;

  @ApiProperty({ example: 6, description: 'Suma de los cuatro módulos' })
  total!: number;
}
