import { ApiProperty } from '@nestjs/swagger';

/** Indicadores del panel principal: conteos REALES en la base (ver IndicadoresTableroService). */
export class IndicadoresInventarioDto {
  @ApiProperty({ description: 'Activos registrados que no están dados de baja.' }) total: number;
  @ApiProperty({ description: 'De ellos, operativos (sin los estados no operativos configurados).' }) operativos: number;
}

export class IndicadoresAccesosDto {
  @ApiProperty() abiertas: number;
  @ApiProperty({ description: 'PENDIENTE (en gestión).' }) enGestion: number;
  @ApiProperty() cerradas: number;
}

export class IndicadoresRespaldosDto {
  @ApiProperty({ description: 'Planes vigentes, no anulados.' }) planesVigentes: number;
  @ApiProperty({ description: `Ejecuciones FALLIDAS (no anuladas) de los últimos 30 días.` }) fallidas30Dias: number;
  @ApiProperty({ description: 'Ejecuciones PARCIALES (no anuladas) de los últimos 30 días.' }) parciales30Dias: number;
}

export class IndicadoresMantenimientosDto {
  @ApiProperty({ description: 'Ejecuciones PROGRAMADAS (pendientes de iniciar), no anuladas.' }) programados: number;
  @ApiProperty() enEjecucion: number;
  @ApiProperty() finalizados: number;
  @ApiProperty({ description: 'Planes vigentes sin ejecución pendiente con la próxima intervención en los próximos 30 días.' }) proximos30Dias: number;
  @ApiProperty({ description: 'Planes vigentes sin ejecución pendiente con la próxima intervención ya pasada.' }) planesVencidos: number;
  @ApiProperty({ description: 'Ejecuciones pendientes con el plazo (fecha límite) vencido.' }) ejecucionesVencidas: number;
}

export class IndicadoresVulnerabilidadesDto {
  @ApiProperty() abiertas: number;
  @ApiProperty() enProgreso: number;
  @ApiProperty() remediadas: number;
  @ApiProperty({ description: 'Pendientes con la fecha límite vencida.' }) vencidas: number;
  @ApiProperty({ description: 'Pendientes de riesgo CRÍTICO.' }) criticasPendientes: number;
}

export class IndicadoresRenovacionesDto {
  @ApiProperty({ description: 'Pendientes (ABIERTO + EN_PROGRESO), no anuladas.' }) pendientes: number;
  @ApiProperty() cerradas: number;
  @ApiProperty({ description: 'Elementos próximos a caducar (umbral de aviso).' }) proximasAVencer: number;
  @ApiProperty({ description: 'Elementos ya caducados (lo que rige hoy, no sustituido).' }) caducadas: number;
  @ApiProperty({ description: 'Umbral de aviso en días.' }) diasAviso: number;
}

export class IndicadoresProcesoDto {
  @ApiProperty() abiertos: number;
  @ApiProperty() enProgreso: number;
  @ApiProperty() cerrados: number;
}

export class IndicadoresEvaluacionesDto extends IndicadoresProcesoDto {
  @ApiProperty({ description: 'Pendientes con la fecha programada de paso a producción ya pasada.' }) vencidas: number;
}

export class IndicadoresTableroDto {
  @ApiProperty({ type: IndicadoresInventarioDto }) inventario: IndicadoresInventarioDto;
  @ApiProperty({ type: IndicadoresAccesosDto }) accesos: IndicadoresAccesosDto;
  @ApiProperty({ type: IndicadoresRespaldosDto }) respaldos: IndicadoresRespaldosDto;
  @ApiProperty({ type: IndicadoresMantenimientosDto }) mantenimientos: IndicadoresMantenimientosDto;
  @ApiProperty({ type: IndicadoresVulnerabilidadesDto }) vulnerabilidades: IndicadoresVulnerabilidadesDto;
  @ApiProperty({ type: IndicadoresRenovacionesDto }) renovaciones: IndicadoresRenovacionesDto;
  @ApiProperty({ type: IndicadoresProcesoDto, description: 'Períodos mensuales de Protección de Endpoints.' }) endpoints: IndicadoresProcesoDto;
  @ApiProperty({ type: IndicadoresEvaluacionesDto }) evaluaciones: IndicadoresEvaluacionesDto;
}
