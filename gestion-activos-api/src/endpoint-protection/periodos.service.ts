import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { diaLocal } from '../common/plazos/plazos.js';
import type { PeriodoEndpoint, Prisma } from '../generated/prisma/client.js';
import type { EstadoPeriodoEndpoint } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AbrirPeriodoDto, DatosRegistroPeriodoDto, PeriodoEndpointDto, QueryPeriodosDto, ReabrirPeriodoDto } from './dto.js';
import { cobertura, equiposSinAntivirus, exigirCierre, exigirCoherencia, type DatosRegistroPeriodo } from './reglas.js';

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PENDIENTES: EstadoPeriodoEndpoint[] = ['ABIERTO', 'EN_PROGRESO'];

const definidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const aDto = (p: PeriodoEndpoint): PeriodoEndpointDto => ({
  ...p,
  cobertura: cobertura(p.totalActivos, p.equiposConAntivirus),
  equiposSinAntivirus: equiposSinAntivirus(p.totalActivos, p.equiposConAntivirus),
});

/**
 * Protección de Endpoints: períodos MENSUALES de medición de la cobertura de antivirus/EDR.
 * Un solo período por año y mes (índice único en la base).
 * Fase 1: apertura (ABIERTO). Fase 2: registro de los totales y la evidencia (guardar avance
 * → EN_PROGRESO) y cierre (→ CERRADO); reabrir solo admin, con motivo. Cada cambio pasa por
 * la auditoría común (versión, valor anterior y nuevo) en la misma transacción.
 */
@Injectable()
export class PeriodosEndpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
  ) {}

  /** Pendientes del tablero: períodos ABIERTO o EN_PROGRESO, no anulados (un registro por mes). */
  contarPendientes(): Promise<number> {
    return this.prisma.periodoEndpoint.count({ where: { estado: { in: PENDIENTES }, anuladoEn: null } });
  }

  async findAll(q: QueryPeriodosDto): Promise<Paginated<PeriodoEndpointDto>> {
    const where: Prisma.PeriodoEndpointWhereInput = {
      anio: q.anio,
      estado: q.estado,
      ...(q.incluirAnulados ? {} : { anuladoEn: null }),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.periodoEndpoint.count({ where }),
      this.prisma.periodoEndpoint.findMany({ where, orderBy: [{ anio: 'desc' }, { mes: 'desc' }], skip: skipFor(q), take: q.limit }),
    ]);
    return paginate(filas.map(aDto), total, q);
  }

  async findOne(id: number): Promise<PeriodoEndpointDto> {
    const p = await this.prisma.periodoEndpoint.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`El período ${id} no existe.`);
    return aDto(p);
  }

  /** Abre el período (ABIERTO): el mes en curso o uno anterior, y uno solo por mes. */
  async abrir(dto: AbrirPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const [anioHoy, mesHoy] = diaLocal(new Date()).split('-').map(Number);
    if (dto.anio * 12 + dto.mes > anioHoy * 12 + mesHoy) {
      throw new BadRequestException('No se puede abrir un período futuro: solo el mes en curso o uno anterior.');
    }
    const existente = await this.prisma.periodoEndpoint.findUnique({ where: { anio_mes: { anio: dto.anio, mes: dto.mes } } });
    if (existente) {
      throw new ConflictException(`El período de ${NOMBRE_MES[dto.mes - 1]} de ${dto.anio} ya existe (n.º ${existente.id}).`);
    }
    // Si dos peticiones abren el mismo mes a la vez, el índice único rechaza la segunda (P2002 → 409).
    const creado = await this.prisma.$transaction(async (tx) => {
      const p = await tx.periodoEndpoint.create({
        data: { anio: dto.anio, mes: dto.mes, responsable: dto.responsable, observacion: dto.observacion || null },
      });
      await this.trazas.registrarAlta(
        tx,
        'PERIODO_ENDPOINT',
        p.id,
        { anio: p.anio, mes: p.mes, responsable: p.responsable, observacion: p.observacion, estado: p.estado },
        'Apertura del período.',
        usuario.username,
      );
      return p;
    });
    return aDto(creado);
  }

  // ── Fase 2 · Registro y cierre ────────────────────────────────────────────

  /**
   * Guardar avance: escribe los datos enviados y deja el período EN_PROGRESO (no lo cierra).
   * Un período CERRADO no se edita: primero se reabre (solo admin, con motivo).
   */
  async registrar(id: number, dto: DatosRegistroPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    if (actual.estado === 'CERRADO') {
      throw new ConflictException(`El período ${id} está CERRADO: un administrador debe reabrirlo para corregirlo.`);
    }
    exigirCoherencia(this.combinar(actual, dto));
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { ...this.cambios(dto), estado: 'EN_PROGRESO' },
      'Avance del registro del período guardado.',
      usuario.username,
      { estado: { in: PENDIENTES } },
    );
    return this.findOne(id);
  }

  /** → CERRADO. Exige los dos totales, el verificable y su repositorio (lo guardado más lo enviado). */
  async cerrar(id: number, dto: DatosRegistroPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, PENDIENTES, 'CERRADO');
    exigirCierre(this.combinar(actual, dto));
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { ...this.cambios(dto), estado: 'CERRADO', cerradoPor: usuario.username },
      'Período registrado y cerrado.',
      usuario.username,
      { estado: { in: PENDIENTES } },
    );
    return this.findOne(id);
  }

  /** CERRADO → EN_PROGRESO (solo admin, con motivo). Los datos se conservan para corregirlos. */
  async reabrir(id: number, dto: ReabrirPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, ['CERRADO'], 'EN_PROGRESO');
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { estado: 'EN_PROGRESO', cerradoPor: null },
      `Reabierto: ${dto.motivo}`.slice(0, 5000),
      usuario.username,
      { estado: 'CERRADO' },
    );
    return this.findOne(id);
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private async exigirVigente(id: number): Promise<PeriodoEndpointDto> {
    const p = await this.findOne(id);
    if (p.anuladoEn) throw new ConflictException(`El período ${id} está anulado: revierta la anulación antes de modificarlo.`);
    return p;
  }

  private exigirEstado(actual: PeriodoEndpointDto, desde: EstadoPeriodoEndpoint[], hacia: EstadoPeriodoEndpoint): void {
    if (!desde.includes(actual.estado)) {
      throw new ConflictException(`El período ${actual.id} está ${actual.estado}: no puede pasar a ${hacia}.`);
    }
  }

  /** Lo guardado más lo enviado: así se valida el resultado, no solo lo que cambia. */
  private combinar(actual: PeriodoEndpointDto, d: DatosRegistroPeriodoDto): DatosRegistroPeriodo {
    return {
      totalActivos: d.totalActivos ?? actual.totalActivos,
      equiposConAntivirus: d.equiposConAntivirus ?? actual.equiposConAntivirus,
      evidencia: d.evidencia ?? actual.evidencia,
      repositorioVerificable: d.repositorioVerificable ?? actual.repositorioVerificable,
    };
  }

  private cambios(d: DatosRegistroPeriodoDto): Record<string, unknown> {
    return definidos({
      totalActivos: d.totalActivos,
      equiposConAntivirus: d.equiposConAntivirus,
      evidencia: d.evidencia,
      repositorioVerificable: d.repositorioVerificable,
      observacion: d.observacion,
    });
  }
}
