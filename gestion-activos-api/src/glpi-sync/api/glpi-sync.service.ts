import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { Sincronizacion } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { componerMotor } from '../componer.js';
import { leerConfig, type GlpiSyncConfig } from '../config.js';
import type { Sincronizador } from '../sincronizador.js';
import type {
  EjecucionDto,
  EstadoSincronizacionDto,
  ResultadoSincronizacionDto,
} from './dto/sincronizacion.dto.js';

/**
 * Crea el motor de sincronización para la API. Está aparte para que las
 * pruebas puedan sustituirlo por uno conectado a un GLPI simulado.
 */
@Injectable()
export class FabricaSincronizador {
  private readonly logger = new Logger('GlpiSync');

  constructor(private readonly prisma: PrismaService) {}

  /** Lanza un error con la lista de variables que faltan si GLPI no está configurado. */
  config(): GlpiSyncConfig {
    return leerConfig(process.env);
  }

  crear(config: GlpiSyncConfig): Sincronizador {
    if (config.ignorarSsl) {
      this.logger.warn(
        'GLPI_IGNORE_SSL=true: NO se valida el certificado HTTPS de GLPI (solo desarrollo).',
      );
    }
    return componerMotor(config, this.prisma, (linea) => this.logger.log(linea));
  }
}

const aEjecucion = (fila: Sincronizacion): EjecucionDto => ({
  id: fila.id,
  origen: fila.origen,
  modo: fila.modo,
  estado: fila.estado,
  solicitadaPor: fila.solicitadaPor,
  inicio: fila.inicio,
  fin: fila.fin,
  contadores: {
    leidos: fila.leidos,
    creados: fila.creados,
    actualizados: fila.actualizados,
    sinCambios: fila.sinCambios,
    inactivados: fila.inactivados,
    reactivados: fila.reactivados,
    omitidos: fila.omitidos,
    errores: fila.errores,
    porRevisar: fila.porRevisar,
    detectados: fila.detectados,
    aplicados: fila.aplicados,
  },
});

/**
 * Sincronización con GLPI lanzada desde la aplicación (botón manual). Corre en
 * el servidor: las credenciales de GLPI nunca salen de él.
 */
@Injectable()
export class GlpiSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fabrica: FabricaSincronizador,
  ) {}

  /**
   * Ejecuta una sincronización REAL. Por defecto incremental (rápida); la
   * reconciliación completa solo si se pide o si nunca se ha sincronizado.
   * Si ya hay otra en curso (otro usuario o la automática) responde 409.
   */
  async sincronizar(
    usuario: AuthUser,
    completa = false,
  ): Promise<ResultadoSincronizacionDto> {
    let config: GlpiSyncConfig;
    try {
      config = this.fabrica.config();
    } catch {
      // El detalle (qué variable falta) queda para el administrador del servidor.
      throw new ServiceUnavailableException(
        'La sincronización con GLPI no está configurada en el servidor.',
      );
    }
    const informe = await this.fabrica
      .crear({
        ...config,
        dryRun: false,
        origen: 'MANUAL',
        solicitadaPor: usuario.username,
        modo: completa ? 'completa' : 'auto',
        // Opciones de consola: nunca desde el botón.
        maxPorTipo: undefined,
        mejorarCodigos: false,
        confirmarBajasMasivas: false,
      })
      .ejecutar();

    if (informe.enCurso) {
      throw new ConflictException(
        'Ya hay una sincronización con GLPI en curso. Espera a que termine.',
      );
    }
    if (informe.ejecucionId === undefined) {
      // No llegó a empezar (catálogos o integridad): nada que registrar.
      throw new ConflictException(informe.errores.join(' '));
    }
    const fila = await this.prisma.sincronizacion.findUniqueOrThrow({
      where: { id: informe.ejecucionId },
    });
    return {
      ...aEjecucion(fila),
      desde: informe.desde ? new Date(informe.desde) : null,
      puntoControlAvanzado: informe.puntoControl !== null,
      errores: informe.errores,
      cambios: informe.elementos
        .filter((e) => e.resultado !== 'SIN_CAMBIOS')
        .slice(0, 200)
        .map((e) => ({
          referencia: `${e.itemtype} #${e.glpiId}`,
          activoId: e.activoId ?? null,
          codigo: e.codigo,
          nombre: e.nombre,
          resultado: e.resultado as ResultadoSincronizacionDto['cambios'][number]['resultado'],
          aplicado: e.aplicado ?? false,
          campos: Object.keys(e.diferencias),
          error: e.error ?? null,
        })),
    };
  }

  async estado(): Promise<EstadoSincronizacionDto> {
    let configurado = true;
    try {
      this.fabrica.config();
    } catch {
      configurado = false;
    }
    const [ultima, exitosa, enCurso] = await Promise.all([
      this.prisma.sincronizacion.findFirst({ orderBy: { id: 'desc' } }),
      this.prisma.sincronizacion.findFirst({
        where: { estado: 'EXITOSA' },
        orderBy: { id: 'desc' },
      }),
      this.prisma.sincronizacion.count({ where: { enCurso: true } }),
    ]);
    return {
      configurado,
      enCurso: enCurso > 0,
      ultimaExitosa: exitosa?.fin ?? null,
      ultima: ultima ? aEjecucion(ultima) : null,
    };
  }
}
