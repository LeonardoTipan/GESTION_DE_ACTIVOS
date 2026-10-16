import { diaLocal } from '../../common/plazos/plazos.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { activoBreve, filtroRegistros, SELECT_ACTIVO } from './dto/comun.dto.js';
import type {
  CrearPlanesDto,
  ModificarPlanDto,
  PlanRespaldoDto,
  QueryPlanesDto,
} from './dto/plan.dto.js';

const INCLUDE = { activo: SELECT_ACTIVO } as const;
type PlanConActivo = Prisma.PlanRespaldoGetPayload<{ include: typeof INCLUDE }>;
const aDto = (p: PlanConActivo): PlanRespaldoDto => ({ ...p, activo: activoBreve(p.activo) });

/** Un plan cuenta si está VIGENTE y no anulado. */
export const PLAN_VIGENTE = { estado: 'VIGENTE', anuladoEn: null } as const;

/** Medianoche UTC de hoy: las fechas de los formularios son días. */
/** Hoy en la zona de la institución, como día de calendario (medianoche UTC). */
export const hoyUtc = (): Date => new Date(`${diaLocal(new Date())}T00:00:00.000Z`);

/**
 * Paso 1 · Alcance del respaldo: qué activos se respaldan y con qué parámetros
 * comprometidos (frecuencia, medio, RPO, RTO, retención…). Un activo tiene a
 * lo sumo un plan vigente; su activo no se cambia: se anula y se crea otro.
 */
@Injectable()
export class PlanesRespaldoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  async findAll(query: QueryPlanesDto): Promise<Paginated<PlanRespaldoDto>> {
    const where: Prisma.PlanRespaldoWhereInput = {
      ...filtroRegistros(query),
      estado: query.estado,
      frecuencia: query.frecuencia,
      ...(query.responsable ? { responsable: { contains: query.responsable } } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.planRespaldo.count({ where }),
      this.prisma.planRespaldo.findMany({
        where,
        include: INCLUDE,
        orderBy: { id: 'asc' },
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async findOne(id: number): Promise<PlanRespaldoDto> {
    const plan = await this.prisma.planRespaldo.findUnique({ where: { id }, include: INCLUDE });
    if (!plan) throw new NotFoundException(`El plan de respaldo ${id} no existe.`);
    return aDto(plan);
  }

  /** Un plan por cada activo: todos operativos y sin plan vigente; o todos, o ninguno. */
  async crear(dto: CrearPlanesDto): Promise<PlanRespaldoDto[]> {
    const { activoIds, vigenteDesde, ...parametros } = dto;
    for (const activoId of activoIds) {
      // Validado en el backend: no basta con que la interfaz solo ofrezca activos operativos.
      await this.activos.exigirOperativo(activoId);
    }
    await this.exigirSinPlanVigente(activoIds);
    const creados = await this.prisma.$transaction((tx) =>
      Promise.all(
        activoIds.map((activoId) =>
          tx.planRespaldo.create({
            data: { ...parametros, activoId, vigenteDesde: vigenteDesde ?? hoyUtc() },
            include: INCLUDE,
          }),
        ),
      ),
    );
    return creados.map(aDto);
  }

  async modificar(id: number, dto: ModificarPlanDto, usuario: AuthUser): Promise<PlanRespaldoDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    if (datos.estado === 'VIGENTE' && actual.estado !== 'VIGENTE') {
      await this.activos.exigirOperativo(actual.activoId);
      await this.exigirSinPlanVigente([actual.activoId], id);
    }
    await this.trazas.modificar('PLAN_RESPALDO', id, datos, motivoCambio, usuario.username);
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, usuario: AuthUser): Promise<PlanRespaldoDto> {
    await this.trazas.anular('PLAN_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Revertir no puede dejar dos planes vigentes para el mismo activo. */
  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<PlanRespaldoDto> {
    const actual = await this.findOne(id);
    if (actual.estado === 'VIGENTE') {
      await this.exigirSinPlanVigente([actual.activoId], id);
    }
    await this.trazas.reversar('PLAN_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Plan vigente sobre el que se puede registrar una ejecución. */
  async exigirVigente(id: number): Promise<PlanRespaldoDto> {
    const plan = await this.prisma.planRespaldo.findUnique({ where: { id }, include: INCLUDE });
    if (!plan) throw new BadRequestException(`El plan de respaldo ${id} no existe.`);
    if (plan.anuladoEn || plan.estado !== 'VIGENTE') {
      throw new BadRequestException(
        `El plan de respaldo ${id} no está vigente (${plan.anuladoEn ? 'anulado' : 'suspendido'}): no admite ejecuciones nuevas.`,
      );
    }
    return aDto(plan);
  }

  private async exigirSinPlanVigente(activoIds: number[], excepto?: number): Promise<void> {
    const conPlan = await this.prisma.planRespaldo.findMany({
      where: { activoId: { in: activoIds }, ...PLAN_VIGENTE, id: excepto ? { not: excepto } : undefined },
      include: INCLUDE,
    });
    if (conPlan.length > 0) {
      throw new ConflictException(
        `Ya tienen un plan de respaldo vigente: ${conPlan.map((p) => `${p.activo.codigo} (plan ${p.id})`).join(', ')}.`,
      );
    }
  }
}
