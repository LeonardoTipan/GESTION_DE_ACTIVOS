import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto.js';
import { ActivoBreveDto } from '../../../common/dto/registro.dto.js';
import type { CierreMantenimiento } from '../../planes/frecuencia.js';
import {
  EstadoEquipo,
  EstadoPlan,
  FaseMantenimiento,
  FrecuenciaMantenimiento,
  TipoMantenimiento,
} from '../../../generated/prisma/enums.js';
import { SemestreDto } from '../../planes/dto.js';

/** Datos mínimos del activo, para mostrarlo sin otra petición. */
export class ActivoMantenidoDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'SRV-001' })
  codigo: string;

  @ApiProperty({ example: 'Servidor de base de datos' })
  nombre: string;
}

/** Lo PLANIFICADO de la ejecución, para mostrarlo junto a lo ejecutado. */
export class PlanificacionBreveDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: FrecuenciaMantenimiento, description: 'Período.' }) frecuencia: FrecuenciaMantenimiento;
  @ApiProperty({ enum: TipoMantenimiento, description: 'Tipo planificado.' }) tipo: TipoMantenimiento;
  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de inicio planificada.' }) fechaInicio: Date;
  @ApiProperty({ description: 'Asignado.' }) responsable: string;
  @ApiProperty({ description: 'Descripción planificada.' }) actividades: string;
  @ApiProperty({ type: Number, description: 'Días de plazo.' }) plazoDias: number;
  @ApiProperty({ enum: EstadoPlan }) estado: EstadoPlan;
}

export class MantenimientoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  activoId: number;

  @ApiProperty({ type: ActivoBreveDto })
  activo: ActivoBreveDto;

  @ApiProperty({ type: Number, nullable: true, description: 'Plan del que procede (capa 1).' })
  planId: number | null;

  @ApiProperty({ enum: TipoMantenimiento })
  tipo: TipoMantenimiento;

  @ApiProperty({ enum: FaseMantenimiento })
  fase: FaseMantenimiento;

  @ApiProperty({
    description: 'PROGRAMADO con fecha ya pasada (calculado).',
    example: false,
  })
  vencido: boolean;

  @ApiProperty({ example: 'Limpieza interna y actualización de firmware' })
  actividad: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha programada.',
  })
  fecha: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaInicio: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaFin: Date | null;

  @ApiProperty({
    enum: EstadoEquipo,
    nullable: true,
    description: 'Se registra al finalizar.',
  })
  estadoEquipo: EstadoEquipo | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resultado al finalizar o motivo al cancelar.',
  })
  resultado: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de registro (automática, la pone el servidor).' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ example: 1, description: 'Sube con cada modificación.' })
  version: number;

  @ApiProperty({ type: String, nullable: true }) tecnico: string | null;
  @ApiProperty({ type: String, nullable: true }) diagnostico: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Minutos.' }) duracionMin: number | null;
  @ApiProperty({ type: Number, nullable: true }) costo: number | null;
  @ApiProperty({ type: String, nullable: true }) repuestos: string | null;
  @ApiProperty({ type: String, nullable: true }) observaciones: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Verificable (nombre del informe o acta).' }) evidencia: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Repositorio del verificable: carpeta o URL http(s).' })
  repositorioVerificable: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Momento de la cancelación (no es una fecha real de fin).' })
  fechaCancelacion: Date | null;
  @ApiProperty({ type: () => PlanificacionBreveDto, nullable: true, description: 'Planificación de origen; null = registro anterior sin planificación.' })
  plan: PlanificacionBreveDto | null;
  @ApiProperty({ type: () => SemestreDto, nullable: true, description: 'Semestre PLANIFICADO (fecha de inicio de la planificación).' })
  semestrePlanificado: SemestreDto | null;
  @ApiProperty({ type: () => SemestreDto, nullable: true, description: 'Semestre REAL (fecha real de mantenimiento); null si no se ha iniciado.' })
  semestreReal: SemestreDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Límite previsto de la ejecución.' })
  fechaLimite: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Límite antes de ampliarlo.' })
  fechaLimiteOriginal: Date | null;
  @ApiProperty({ description: 'Iniciado o terminado fuera del intervalo previsto, como excepción.' })
  fueraDePlazo: boolean;
  @ApiProperty({ type: String, nullable: true }) motivoExcepcion: string | null;
  @ApiProperty({ type: String, nullable: true }) excepcionPor: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Capa 3: inicio previsto de la verificación.' })
  verificacionPrevista: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) verificacionLimite: Date | null;

  @ApiProperty({
    enum: ['NO_APLICA', 'PENDIENTE_VERIFICACION', 'CERRADO', 'EN_SEGUIMIENTO', 'NO_SATISFACTORIO'],
    description: 'Capa 3: según la última verificación vigente (solo en los FINALIZADOS).',
  })
  cierre: CierreMantenimiento;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Anulado (eliminación lógica); null = vigente.' })
  anuladoEn: Date | null;

  @ApiProperty({ type: String, nullable: true })
  anuladoPor: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivoAnulacion: string | null;
}

export class PaginatedMantenimientoDto extends PaginatedResponseDto(
  MantenimientoDto,
) {}
