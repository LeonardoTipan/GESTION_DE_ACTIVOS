import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ControlAccesoService } from '../access-control/control-acceso.service.js';
import { MantenimientosService } from '../maintenance/mantenimientos/mantenimientos.service.js';
import { RenovacionesService } from '../renewals/renovaciones.service.js';
import { VulnerabilidadesService } from '../vulnerabilities/vulnerabilidades/vulnerabilidades.service.js';
import type { PendientesTableroDto } from './dto.js';

type Modulo = Exclude<keyof PendientesTableroDto, 'total'>;

/**
 * Resumen del tablero. Cada módulo define qué es «pendiente» en su propio servicio
 * (contarPendientes, un COUNT en la base); aquí solo se consolidan.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly accesos: ControlAccesoService,
    private readonly mantenimientos: MantenimientosService,
    private readonly vulnerabilidades: VulnerabilidadesService,
    private readonly renovaciones: RenovacionesService,
  ) {}

  async pendientes(): Promise<PendientesTableroDto> {
    const conteos: Record<Modulo, () => Promise<number>> = {
      accesos: () => this.accesos.contarPendientes(),
      mantenimientos: () => this.mantenimientos.contarPendientes(),
      vulnerabilidades: () => this.vulnerabilidades.contarPendientes(),
      renovaciones: () => this.renovaciones.contarPendientes(),
    };
    const modulos = Object.keys(conteos) as Modulo[];
    const resultados = await Promise.allSettled(modulos.map((m) => conteos[m]()));

    // Un conteo fallido nunca se devuelve como 0: se registra y la petición falla.
    const fallidos = modulos.filter((_, i) => resultados[i].status === 'rejected');
    if (fallidos.length) {
      resultados.forEach((r, i) => {
        if (r.status === 'rejected') {
          const e = r.reason as Error;
          this.logger.error(`No se pudo contar los pendientes de ${modulos[i]}: ${e?.message}`, e?.stack);
        }
      });
      throw new InternalServerErrorException('No se pudieron contar los trámites pendientes. Inténtelo de nuevo.');
    }

    const datos = Object.fromEntries(
      modulos.map((m, i) => [m, (resultados[i] as PromiseFulfilledResult<number>).value]),
    ) as Record<Modulo, number>;
    return { ...datos, total: modulos.reduce((suma, m) => suma + datos[m], 0) };
  }
}
