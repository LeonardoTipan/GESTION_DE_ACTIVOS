import { Injectable } from '@nestjs/common';
import type { BitacoraIndicadorDto } from '../../common/bitacora/dto.js';
import { rangoAnio } from '../../common/bitacora/periodos.js';
import { paginate, skipFor, type Paginated } from '../../common/dto/paginated-response.dto.js';
import { dia } from '../../common/indicadores/indicador.js';
import { diaLocal } from '../../common/plazos/plazos.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FrecuenciaVentana } from '../tablero/ventanas.js';
import {
  bitacoraRespaldos,
  ventanasDelAnio,
  vigencias,
  type EjecucionBitacoraRespaldo,
  type RestauracionBitacoraRespaldo,
  type VentanaBitacoraRespaldo,
} from './calculo.js';
import type { FilaBitacoraRespaldoDto, QueryBitacoraEspecificaRespaldosDto } from './dto.js';

const DIA_MS = 86_400_000;

/**
 * Bitácora de Respaldos (solo lectura): General mensual y Específica por ventana programada.
 * Usa los planes NO anulados con su vigencia histórica (reconstruida desde la auditoría) y las
 * ejecuciones y restauraciones no anuladas.
 */
@Injectable()
export class BitacoraRespaldosService {
  constructor(private readonly prisma: PrismaService) {}

  async general(anio: number): Promise<BitacoraIndicadorDto> {
    const d = await this.datos(anio);
    return bitacoraRespaldos(anio, d.ventanas, d.ejecuciones, d.restauraciones);
  }

  async especifica(q: QueryBitacoraEspecificaRespaldosDto): Promise<Paginated<FilaBitacoraRespaldoDto>> {
    const { ventanas } = await this.datos(q.anio);
    const texto = (s: string | null | undefined, t: string) => (s ?? '').toLowerCase().includes(t.toLowerCase());
    const filtradas = ventanas
      .filter((w) => !q.mes || w.mes === q.mes)
      .filter((w) => !q.situacion || w.situacion === q.situacion)
      .filter((w) => !q.q || texto(w.activo.codigo, q.q) || texto(w.activo.nombre, q.q))
      .filter((w) => !q.responsable || texto(w.responsablePlan, q.responsable) || texto(w.ejecucion?.responsable, q.responsable))
      .sort((a, b) => b.ini.localeCompare(a.ini) || a.activo.codigo.localeCompare(b.activo.codigo));
    const pagina = filtradas.slice(skipFor(q), skipFor(q) + q.limit);
    return paginate(pagina as FilaBitacoraRespaldoDto[], filtradas.length, q);
  }

  private async datos(anio: number): Promise<{
    ventanas: VentanaBitacoraRespaldo[];
    ejecuciones: EjecucionBitacoraRespaldo[];
    restauraciones: RestauracionBitacoraRespaldo[];
  }> {
    const { desde, hasta } = rangoAnio(anio);
    // Margen de un día a cada lado: luego se filtra por el DÍA LOCAL.
    const enAnio = { gte: new Date(desde.getTime() - DIA_MS), lt: new Date(hasta.getTime() + DIA_MS) };
    const delAnio = (dia: string) => dia.startsWith(String(anio));
    const planes = await this.prisma.planRespaldo.findMany({
      where: { anuladoEn: null, vigenteDesde: { lt: hasta } },
      include: { activo: { select: { id: true, codigo: true, nombre: true, deletedAt: true, inactivoDesde: true } } },
    });
    const ids = planes.map((p) => p.id);
    const [trazas, ejecuciones] = await Promise.all([
      this.prisma.registroCambio.findMany({
        where: { entidad: 'PLAN_RESPALDO', registroId: { in: ids }, accion: 'MODIFICAR' },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
        select: { registroId: true, fecha: true, cambios: true },
      }),
      this.prisma.ejecucionRespaldo.findMany({
        where: { anuladoEn: null, planId: { in: ids }, fecha: enAnio },
        select: { id: true, planId: true, fecha: true, resultado: true, responsable: true, evidencia: true },
      }),
    ]);
    const ejecs = ejecuciones.map((e) => ({ ...e, fecha: diaLocal(e.fecha) })).filter((e) => delAnio(e.fecha));
    const restauraciones = (
      await this.prisma.restauracion.findMany({
        where: { anuladoEn: null, OR: [{ ejecucionId: { in: ejecs.map((e) => e.id) } }, { fecha: enAnio }] },
        select: { id: true, ejecucionId: true, fecha: true, resultado: true, motivo: true, evidencia: true, responsable: true },
      })
    ).map((r) => ({ ...r, fecha: diaLocal(r.fecha) }));

    const cambiosDe = (planId: number) =>
      trazas
        .filter((t) => t.registroId === planId)
        .flatMap((t) =>
          (JSON.parse(t.cambios) as { campo: string; antes: unknown; despues: unknown }[])
            .filter((c) => c.campo === 'estado')
            .map((c) => ({ dia: diaLocal(t.fecha), antes: c.antes, despues: c.despues })),
        );
    const baja = (a: { deletedAt: Date | null; inactivoDesde: Date | null }) => {
      const fechas = [a.deletedAt, a.inactivoDesde].filter((f): f is Date => f !== null);
      return fechas.length ? diaLocal(new Date(Math.min(...fechas.map((f) => f.getTime())))) : null;
    };
    const ventanas = ventanasDelAnio(
      anio,
      planes.map((p) => {
        // vigenteDesde es un DÍA guardado a medianoche UTC (como en el tablero): no se convierte de zona.
        const vigenteDesde = dia(p.vigenteDesde);
        return {
          id: p.id,
          activo: { id: p.activo.id, codigo: p.activo.codigo, nombre: p.activo.nombre },
          responsable: p.responsable,
          frecuencia: p.frecuencia as FrecuenciaVentana,
          vigenteDesde,
          vigencias: vigencias(vigenteDesde, p.estado, cambiosDe(p.id)),
          bajaActivo: baja(p.activo),
        };
      }),
      ejecs,
      restauraciones,
      diaLocal(new Date()),
    );
    return { ventanas, ejecuciones: ejecs, restauraciones: restauraciones.filter((r) => delAnio(r.fecha)) };
  }
}
