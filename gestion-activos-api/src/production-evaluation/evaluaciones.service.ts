import { ConflictException, Injectable } from '@nestjs/common';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../common/dto/registro.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EvaluacionSistemaDto, PlanificarEvaluacionDto, QueryEvaluacionesDto } from './dto.js';

const PENDIENTES: EstadoEvaluacionSistema[] = ['ABIERTO', 'EN_PROGRESO'];
const INCLUDE = { activo: SELECT_ACTIVO } as const;
type EvaluacionConActivo = Prisma.EvaluacionSistemaGetPayload<{ include: typeof INCLUDE }>;

const aDto = (e: EvaluacionConActivo, ahora = new Date()): EvaluacionSistemaDto => ({
  ...e,
  activo: activoBreve(e.activo),
  vencida: PENDIENTES.includes(e.estado) && e.fechaProgramadaProduccion < ahora,
});

/**
 * Evaluación de Sistemas Productivos · fase 1: planificación de la evaluación de seguridad
 * de un sistema antes de su paso a producción. La fecha programada de paso a producción
 * no es la fecha de solicitud. La fase 2 (fecha real de las pruebas e informe) aún no
 * está implementada.
 */
@Injectable()
export class EvaluacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  /**
   * Pendientes del tablero: ABIERTO o EN_PROGRESO, no anuladas. Las vencidas ya están
   * incluidas (son pendientes con la fecha programada pasada): no se suman aparte.
   */
  contarPendientes(): Promise<number> {
    return this.prisma.evaluacionSistema.count({ where: { estado: { in: PENDIENTES }, anuladoEn: null } });
  }

  async findAll(q: QueryEvaluacionesDto): Promise<Paginated<EvaluacionSistemaDto>> {
    const ahora = new Date();
    const filtros: Prisma.EvaluacionSistemaWhereInput[] = [{ activoId: q.activoId, estado: q.estado }];
    if (!q.incluirAnulados) filtros.push({ anuladoEn: null });
    if (q.pendientes === true) filtros.push({ estado: { in: PENDIENTES } });
    if (q.pendientes === false) filtros.push({ estado: 'CERRADO' });
    if (q.vencidas) filtros.push({ estado: { in: PENDIENTES }, fechaProgramadaProduccion: { lt: ahora } });
    if (q.desde || q.hasta) filtros.push({ fechaProgramadaProduccion: { gte: q.desde, lte: q.hasta } });
    if (q.q) {
      filtros.push({
        OR: [
          { activo: { codigo: { contains: q.q } } },
          { activo: { nombre: { contains: q.q } } },
          { descripcion: { contains: q.q } },
          { responsable: { contains: q.q } },
        ],
      });
    }
    const where: Prisma.EvaluacionSistemaWhereInput = { AND: filtros };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.evaluacionSistema.count({ where }),
      this.prisma.evaluacionSistema.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fechaProgramadaProduccion: 'asc' }, { id: 'asc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(filas.map((e) => aDto(e, ahora)), total, q);
  }

  /**
   * Planifica la evaluación (ABIERTO). El sistema debe estar operativo y su categoría
   * habilitada para Evaluación; solo una evaluación pendiente por sistema.
   */
  async planificar(dto: PlanificarEvaluacionDto, usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    await this.activos.exigirOperativo(dto.activoId, 'EVALUACION');
    const pendiente = await this.prisma.evaluacionSistema.findFirst({
      where: { activoId: dto.activoId, estado: { in: PENDIENTES }, anuladoEn: null },
      select: { id: true },
    });
    if (pendiente) {
      throw new ConflictException(`El sistema ya tiene una evaluación pendiente (n.º ${pendiente.id}): ciérrela antes de planificar otra.`);
    }
    const creada = await this.prisma.$transaction(async (tx) => {
      const e = await tx.evaluacionSistema.create({
        data: {
          activoId: dto.activoId,
          fechaProgramadaProduccion: dto.fechaProgramadaProduccion,
          responsable: dto.responsable,
          descripcion: dto.descripcion,
        },
        include: INCLUDE,
      });
      await this.trazas.registrarAlta(
        tx,
        'EVALUACION_SISTEMA',
        e.id,
        { activoId: e.activoId, fechaProgramadaProduccion: e.fechaProgramadaProduccion, responsable: e.responsable, descripcion: e.descripcion, estado: e.estado },
        'Planificación de la evaluación.',
        usuario.username,
      );
      return e;
    });
    return aDto(creada);
  }
}
