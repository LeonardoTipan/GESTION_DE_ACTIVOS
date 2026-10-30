import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RenovacionesService } from '../renewals/renovaciones.service.js';
import type { IndicadoresTableroDto } from './indicadores.dto.js';

const DIA = 86_400_000;
const NO_ANULADO = { anuladoEn: null } as const;

/**
 * Indicadores del panel principal: SOLO LECTURA y conteos reales (COUNT) en la base. Las
 * reglas que no son un simple estado se toman del módulo dueño (qué es «operativo» en el
 * inventario, la vigencia de las renovaciones). Las cuentas de estado usan los mismos estados
 * y criterios que los listados de cada módulo (sin anulados). Si algún conteo falla, la
 * petición falla (500): nunca se devuelve 0 en su lugar.
 */
@Injectable()
export class IndicadoresTableroService {
  private readonly logger = new Logger(IndicadoresTableroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly renovaciones: RenovacionesService,
  ) {}

  async indicadores(ahora = new Date()): Promise<IndicadoresTableroDto> {
    const p = this.prisma;
    const hace30 = new Date(ahora.getTime() - 30 * DIA);
    const en30 = new Date(ahora.getTime() + 30 * DIA);
    const sinPendiente = { mantenimientos: { none: { fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] as ('PROGRAMADO' | 'EN_EJECUCION')[] }, anuladoEn: null } } };
    const planVigente = { estado: 'VIGENTE' as const, ...NO_ANULADO };
    try {
      const [
        totalActivos, operativos,
        accAbiertas, accGestion, accCerradas,
        planesResp, fallidas, parciales,
        mProg, mEjec, mFin, mProximos, mPlanesVencidos, mEjecVencidas,
        vAbiertas, vProgreso, vRemediadas, vVencidas, vCriticas,
        rPendientes, rCerradas, vigencias,
        eAbiertos, eProgreso, eCerrados,
        evAbiertas, evProgreso, evCerradas, evVencidas,
      ] = await Promise.all([
        p.activo.count({ where: { deletedAt: null } }),
        p.activo.count({ where: this.activos.filtroOperativo() }),
        p.controlAcceso.count({ where: { estado: 'ABIERTO' } }),
        p.controlAcceso.count({ where: { estado: 'PENDIENTE' } }),
        p.controlAcceso.count({ where: { estado: 'CERRADO' } }),
        p.planRespaldo.count({ where: planVigente }),
        p.ejecucionRespaldo.count({ where: { ...NO_ANULADO, resultado: 'FALLIDO', fecha: { gte: hace30 } } }),
        p.ejecucionRespaldo.count({ where: { ...NO_ANULADO, resultado: 'PARCIAL', fecha: { gte: hace30 } } }),
        p.mantenimiento.count({ where: { ...NO_ANULADO, fase: 'PROGRAMADO' } }),
        p.mantenimiento.count({ where: { ...NO_ANULADO, fase: 'EN_EJECUCION' } }),
        p.mantenimiento.count({ where: { ...NO_ANULADO, fase: 'FINALIZADO' } }),
        p.planMantenimiento.count({ where: { ...planVigente, ...sinPendiente, proximaFecha: { gte: ahora, lte: en30 } } }),
        p.planMantenimiento.count({ where: { ...planVigente, ...sinPendiente, proximaFecha: { lt: ahora } } }),
        p.mantenimiento.count({ where: { ...NO_ANULADO, fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] }, fechaLimite: { lt: ahora } } }),
        p.vulnerabilidad.count({ where: { ...NO_ANULADO, estado: 'ABIERTO' } }),
        p.vulnerabilidad.count({ where: { ...NO_ANULADO, estado: 'EN_PROGRESO' } }),
        p.vulnerabilidad.count({ where: { ...NO_ANULADO, estado: 'REMEDIADO' } }),
        p.vulnerabilidad.count({ where: { ...NO_ANULADO, estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, fechaLimite: { lt: ahora } } }),
        p.vulnerabilidad.count({ where: { ...NO_ANULADO, estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, nivelRiesgo: 'CRITICO' } }),
        p.renovacion.count({ where: { ...NO_ANULADO, estado: { in: ['ABIERTO', 'EN_PROGRESO'] } } }),
        p.renovacion.count({ where: { ...NO_ANULADO, estado: 'CERRADO' } }),
        this.renovaciones.resumen(),
        p.periodoEndpoint.count({ where: { ...NO_ANULADO, estado: 'ABIERTO' } }),
        p.periodoEndpoint.count({ where: { ...NO_ANULADO, estado: 'EN_PROGRESO' } }),
        p.periodoEndpoint.count({ where: { ...NO_ANULADO, estado: 'CERRADO' } }),
        p.evaluacionSistema.count({ where: { ...NO_ANULADO, estado: 'ABIERTO' } }),
        p.evaluacionSistema.count({ where: { ...NO_ANULADO, estado: 'EN_PROGRESO' } }),
        p.evaluacionSistema.count({ where: { ...NO_ANULADO, estado: 'CERRADO' } }),
        p.evaluacionSistema.count({ where: { ...NO_ANULADO, estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, fechaProgramadaProduccion: { lt: ahora } } }),
      ]);
      return {
        inventario: { total: totalActivos, operativos },
        accesos: { abiertas: accAbiertas, enGestion: accGestion, cerradas: accCerradas },
        respaldos: { planesVigentes: planesResp, fallidas30Dias: fallidas, parciales30Dias: parciales },
        mantenimientos: { programados: mProg, enEjecucion: mEjec, finalizados: mFin, proximos30Dias: mProximos, planesVencidos: mPlanesVencidos, ejecucionesVencidas: mEjecVencidas },
        vulnerabilidades: { abiertas: vAbiertas, enProgreso: vProgreso, remediadas: vRemediadas, vencidas: vVencidas, criticasPendientes: vCriticas },
        renovaciones: { pendientes: rPendientes, cerradas: rCerradas, proximasAVencer: vigencias.proximas, caducadas: vigencias.caducadas, diasAviso: vigencias.diasAviso },
        endpoints: { abiertos: eAbiertos, enProgreso: eProgreso, cerrados: eCerrados },
        evaluaciones: { abiertos: evAbiertas, enProgreso: evProgreso, cerrados: evCerradas, vencidas: evVencidas },
      };
    } catch (e) {
      const error = e as Error;
      this.logger.error(`No se pudieron calcular los indicadores del panel: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException('No se pudieron calcular los indicadores. Inténtelo de nuevo.');
    }
  }
}
