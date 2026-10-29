import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { diaLocal } from '../common/plazos/plazos.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AbrirPeriodoDto, PeriodoEndpointDto, QueryPeriodosDto } from './dto.js';

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Protección de Endpoints · fase 1: períodos MENSUALES de medición de la cobertura de
 * antivirus/EDR. Un solo período por año y mes (índice único en la base). La fase 2
 * (totales, equipos con antivirus, Excel del inventario) aún no está implementada.
 */
@Injectable()
export class PeriodosEndpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
  ) {}

  /** Pendientes del tablero: períodos ABIERTO o EN_PROGRESO, no anulados (un registro por mes). */
  contarPendientes(): Promise<number> {
    return this.prisma.periodoEndpoint.count({ where: { estado: { in: ['ABIERTO', 'EN_PROGRESO'] }, anuladoEn: null } });
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
    return paginate(filas, total, q);
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
    return this.prisma.$transaction(async (tx) => {
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
  }
}
