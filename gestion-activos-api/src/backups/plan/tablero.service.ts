import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { dia, IndicadorDto } from '../../common/indicadores/indicador.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { calcularTablero, type Tablero } from '../tablero/tablero.js';
import type { FrecuenciaVentana } from '../tablero/ventanas.js';
import { PLAN_VIGENTE } from './planes.service.js';
import type { EventoAgendaDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import { diaLocal } from '../../common/plazos/plazos.js';
import { activoBreve, SELECT_ACTIVO } from './dto/comun.dto.js';
import { agendaRespaldos } from './agenda.js';

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
    // Margen de un día a cada lado: luego se filtra por el DÍA LOCAL (un respaldo
    // a las 22:30 de Quito ya es el día siguiente en UTC, y cuenta en su día).
    const enPeriodo = {
      anuladoEn: null,
      fecha: { gte: new Date(ini.getTime() - 24 * 3_600_000), lte: new Date(fin.getTime() + 2 * 24 * 3_600_000) },
    };
    const delPeriodo = <T extends { fecha: Date }>(xs: T[]) =>
      xs.map((x) => ({ ...x, fecha: diaLocal(x.fecha) })).filter((x) => x.fecha >= periodo.ini && x.fecha <= periodo.fin);
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
      hoy: diaLocal(new Date()),
      periodo,
      criticos,
      planes: planes.map((p) => ({
        id: p.id,
        activo: p.activo,
        frecuencia: p.frecuencia as FrecuenciaVentana,
        frecuenciaPrueba: p.frecuenciaPrueba as FrecuenciaVentana,
        vigenteDesde: dia(p.vigenteDesde),
      })),
      ejecuciones: delPeriodo(ejecuciones),
      restauraciones: delPeriodo(restauraciones),
    });
    return { desde: periodo.ini, hasta: periodo.fin, ...tablero };
  }

  /** Agenda (calendario) de las tres capas en un rango, con filtros. */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const deActivo = q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {};
    const contiene = q.responsable ? { responsable: { contains: q.responsable } } : {};
    // Las ventanas se calculan desde el inicio del plan: se necesitan TODAS sus ejecuciones del rango (±1 día por la zona).
    const fecha = { gte: new Date(q.desde.getTime() - 24 * 3_600_000), lte: new Date(q.hasta.getTime() + 24 * 3_600_000) };
    const [planes, ejecuciones, restauraciones] = await Promise.all([
      this.prisma.planRespaldo.findMany({
        where: { ...PLAN_VIGENTE, activo: this.activos.filtroOperativo(), ...deActivo, ...contiene },
        include: { activo: SELECT_ACTIVO },
      }),
      this.prisma.ejecucionRespaldo.findMany({
        where: {
          anuladoEn: null,
          ...deActivo,
          OR: [{ fecha }, { pruebaPrevista: { lte: q.hasta }, OR: [{ pruebaLimite: { gte: q.desde } }, { pruebaLimite: null }] }],
        },
        include: { activo: SELECT_ACTIVO },
        take: 5000,
      }),
      this.prisma.restauracion.findMany({ where: { anuladoEn: null, ...deActivo, fecha }, include: { activo: SELECT_ACTIVO }, take: 5000 }),
    ]);
    const responsableCoincide = (r: string) => !q.responsable || r.toLowerCase().includes(q.responsable.toLowerCase());
    const eventos = agendaRespaldos({
      planes: planes.map((p) => ({ ...p, activo: activoBreve(p.activo) })),
      // El filtro de responsable se aplica a cada registro (el plan ya viene filtrado).
      ejecuciones: ejecuciones.map((e) => ({ ...e, activo: activoBreve(e.activo) })),
      restauraciones: restauraciones.filter((r) => responsableCoincide(r.responsable)).map((r) => ({ ...r, activo: activoBreve(r.activo) })),
      desde: q.desde,
      hasta: q.hasta,
      ahora: new Date(),
      capa: q.capa,
    }).filter((e) => !e.responsable || responsableCoincide(e.responsable));
    return q.estado ? eventos.filter((e) => e.estado === q.estado) : eventos;
  }
}
