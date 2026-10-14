import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { dia, IndicadorDto } from '../../common/indicadores/indicador.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { calcularTablero, type Tablero } from '../tablero/tablero.js';
import type { FrecuenciaVentana } from '../tablero/ventanas.js';
import { PLAN_VIGENTE } from './planes.service.js';

/** Niveles de criticidad que cuentan como "críticos" (CRITICIDADES_CRITICAS). */
const CRITICAS_POR_DEFECTO = 'Alta,Crítica';

class ActivoTableroDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
}

class VentanaDto {
  @ApiProperty({ example: '2026-07-01' }) ini: string;
  @ApiProperty({ example: '2026-07-31' }) fin: string;
  @ApiProperty({ example: 'jul 2026' }) corto: string;
  @ApiProperty({ example: 'julio de 2026' }) etiqueta: string;
  @ApiProperty({ enum: ['CUMPLIDA', 'VENCIDA', 'EN_CURSO', 'PROGRAMADA'] }) estado: string;
  @ApiProperty({ type: [Number], description: 'Registros que la cubren.' }) registros: number[];
}

class CalendarioPlanDto {
  @ApiProperty() planId: number;
  @ApiProperty({ type: ActivoTableroDto }) activo: ActivoTableroDto;
  @ApiProperty() frecuencia: string;
  @ApiProperty() frecuenciaPrueba: string;
  @ApiProperty({ type: [VentanaDto], description: 'Ventanas de ejecución.' }) ejecucion: VentanaDto[];
  @ApiProperty({ type: [VentanaDto], description: 'Ventanas de prueba de restauración.' }) prueba: VentanaDto[];
}

class PendientesDto {
  @ApiProperty() ejecucion: number;
  @ApiProperty() prueba: number;
}

export class TableroRespaldosDto {
  @ApiProperty({ example: '2026-07-01' }) desde: string;
  @ApiProperty({ example: '2026-09-30' }) hasta: string;
  @ApiProperty({ type: [IndicadorDto] }) indicadores: IndicadorDto[];
  @ApiProperty({ type: [CalendarioPlanDto] }) calendario: CalendarioPlanDto[];
  @ApiProperty({ type: PendientesDto, description: 'Ventanas en curso o vencidas sin registro.' })
  pendientes: PendientesDto;
}

/** Trimestre natural que contiene la fecha. */
function trimestre(fecha: Date): { desde: Date; hasta: Date } {
  const y = fecha.getUTCFullYear();
  const q = Math.floor(fecha.getUTCMonth() / 3);
  return { desde: new Date(Date.UTC(y, q * 3, 1)), hasta: new Date(Date.UTC(y, q * 3 + 3, 0)) };
}

/**
 * Indicadores y calendarios de respaldos del período. Solo cuentan los
 * registros vigentes (los anulados se excluyen) y los planes de activos
 * operativos.
 */
@Injectable()
export class TableroRespaldosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly config: ConfigService,
  ) {}

  async tablero(desde?: Date, hasta?: Date): Promise<TableroRespaldosDto> {
    const porDefecto = trimestre(new Date());
    const ini = desde ?? porDefecto.desde;
    const fin = hasta ?? porDefecto.hasta;
    if (fin < ini) throw new BadRequestException('"hasta" no puede ser anterior a "desde".');
    const periodo = { ini: dia(ini), fin: dia(fin) };
    const enPeriodo = {
      anuladoEn: null,
      fecha: { gte: ini, lte: new Date(fin.getTime() + 24 * 3_600_000 - 1) },
    };
    const criticidades = (this.config.get<string>('CRITICIDADES_CRITICAS') ?? CRITICAS_POR_DEFECTO)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const operativo = this.activos.filtroOperativo();
    const seleccion = { select: { id: true, codigo: true, nombre: true } } as const;

    const [criticos, planes, ejecuciones, restauraciones] = await Promise.all([
      this.prisma.activo.findMany({
        where: { AND: [operativo, { criticidad: { nivel: { in: criticidades } } }] },
        ...seleccion,
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.planRespaldo.findMany({
        where: { ...PLAN_VIGENTE, activo: operativo },
        include: { activo: seleccion },
        orderBy: { id: 'asc' },
      }),
      this.prisma.ejecucionRespaldo.findMany({ where: enPeriodo }),
      this.prisma.restauracion.findMany({ where: enPeriodo }),
    ]);

    const tablero: Tablero = calcularTablero({
      hoy: dia(new Date()),
      periodo,
      criticos,
      planes: planes.map((p) => ({
        id: p.id,
        activo: p.activo,
        frecuencia: p.frecuencia as FrecuenciaVentana,
        frecuenciaPrueba: p.frecuenciaPrueba as FrecuenciaVentana,
        vigenteDesde: dia(p.vigenteDesde),
      })),
      ejecuciones: ejecuciones.map((e) => ({ ...e, fecha: dia(e.fecha) })),
      restauraciones: restauraciones.map((r) => ({ ...r, fecha: dia(r.fecha) })),
    });
    return { desde: periodo.ini, hasta: periodo.fin, ...tablero };
  }
}
