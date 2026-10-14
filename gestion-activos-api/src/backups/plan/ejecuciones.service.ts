import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { activoBreve, filtroRegistros, finDelDia, SELECT_ACTIVO } from './dto/comun.dto.js';
import { AvisosService } from '../../audit/avisos.service.js';
import type {
  EjecucionRespaldoDto,
  ModificarEjecucionDto,
  ModificarRestauracionDto,
  QueryEjecucionesDto,
  QueryRestauracionesDto,
  RegistrarEjecucionDto,
  RegistrarRestauracionDto,
  RestauracionDto,
} from './dto/ejecucion.dto.js';
import { hoyUtc, PlanesRespaldoService } from './planes.service.js';

const INCLUDE = { activo: SELECT_ACTIVO } as const;
type ConActivo<T> = T & { activo: Parameters<typeof activoBreve>[0] };
const aDto = <T extends object>(r: ConActivo<T>) => ({ ...r, activo: activoBreve(r.activo) });

/** Una fecha (día) no puede ser posterior a hoy. */
function exigirNoFutura(fecha: Date | undefined): void {
  if (fecha && fecha.getTime() > hoyUtc().getTime() + 24 * 3_600_000 - 1) {
    throw new BadRequestException('La fecha no puede ser futura.');
  }
}

/** Filtro de período por fecha del registro. */
const periodo = (desde?: Date, hasta?: Date) =>
  desde || hasta ? { fecha: { gte: desde, lte: hasta ? finDelDia(hasta) : undefined } } : {};

/** Responsable que contiene el texto. */
const responsable = (texto?: string) => (texto ? { responsable: { contains: texto } } : {});

/**
 * Paso 2 · Ejecución del respaldo: cada corrida sobre un activo con plan
 * vigente. Se modifica con motivo (versionado) y se anula, nunca se borra.
 */
@Injectable()
export class EjecucionesRespaldoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly planes: PlanesRespaldoService,
    private readonly trazas: TrazasService,
    private readonly avisos: AvisosService,
  ) {}

  async findAll(query: QueryEjecucionesDto): Promise<Paginated<EjecucionRespaldoDto>> {
    const where: Prisma.EjecucionRespaldoWhereInput = {
      ...filtroRegistros(query),
      planId: query.planId,
      resultado: query.resultado,
      ...periodo(query.desde, query.hasta),
      ...responsable(query.responsable),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.ejecucionRespaldo.count({ where }),
      this.prisma.ejecucionRespaldo.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async findOne(id: number): Promise<EjecucionRespaldoDto> {
    const r = await this.prisma.ejecucionRespaldo.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException(`La ejecución de respaldo ${id} no existe.`);
    return aDto(r);
  }

  async registrar(dto: RegistrarEjecucionDto): Promise<EjecucionRespaldoDto> {
    exigirNoFutura(dto.fecha);
    const plan = await this.planes.exigirVigente(dto.planId);
    await this.activos.exigirOperativo(plan.activoId);
    const r = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.ejecucionRespaldo.create({
        data: { ...dto, activoId: plan.activoId },
        include: INCLUDE,
      });
      if (creada.resultado === 'FALLIDO') {
        await this.avisos.avisar(
          {
            tipo: 'RESPALDO_FALLIDO',
            titulo: `Respaldo fallido: ${creada.activo.codigo} · ${creada.activo.nombre}`,
            mensaje: `La ejecución ${creada.id} del plan ${plan.id} terminó con resultado FALLIDO.`,
            activoId: creada.activoId,
          },
          tx,
        );
      }
      return creada;
    });
    return aDto(r);
  }

  async modificar(id: number, dto: ModificarEjecucionDto, usuario: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    exigirNoFutura(datos.fecha);
    await this.trazas.modificar('EJECUCION_RESPALDO', id, datos, motivoCambio, usuario.username);
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.anular('EJECUCION_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.reversar('EJECUCION_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }
}

/**
 * Paso 3 · Restauración o prueba de un respaldo ejecutado: mide el tiempo real
 * frente al RTO y deja la evidencia (acta o ticket).
 */
@Injectable()
export class RestauracionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  async findAll(query: QueryRestauracionesDto): Promise<Paginated<RestauracionDto>> {
    const where: Prisma.RestauracionWhereInput = {
      ...filtroRegistros(query),
      ejecucionId: query.ejecucionId,
      resultado: query.resultado,
      motivo: query.motivo,
      ...periodo(query.desde, query.hasta),
      ...responsable(query.responsable),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.restauracion.count({ where }),
      this.prisma.restauracion.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async findOne(id: number): Promise<RestauracionDto> {
    const r = await this.prisma.restauracion.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException(`La restauración ${id} no existe.`);
    return aDto(r);
  }

  async registrar(dto: RegistrarRestauracionDto): Promise<RestauracionDto> {
    exigirNoFutura(dto.fecha);
    const origen = await this.prisma.ejecucionRespaldo.findUnique({
      where: { id: dto.ejecucionId },
    });
    if (!origen) {
      throw new BadRequestException(`La ejecución de respaldo ${dto.ejecucionId} no existe.`);
    }
    if (origen.anuladoEn || origen.resultado === 'FALLIDO') {
      throw new BadRequestException(
        `La ejecución ${origen.id} ${origen.anuladoEn ? 'está anulada' : 'falló'}: no hay respaldo que restaurar.`,
      );
    }
    if (dto.fecha < origen.fecha) {
      throw new BadRequestException('La restauración no puede ser anterior a la ejecución del respaldo.');
    }
    await this.activos.exigirOperativo(origen.activoId);
    const r = await this.prisma.restauracion.create({
      data: { ...dto, activoId: origen.activoId },
      include: INCLUDE,
    });
    return aDto(r);
  }

  async modificar(id: number, dto: ModificarRestauracionDto, usuario: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    exigirNoFutura(datos.fecha);
    await this.trazas.modificar('RESTAURACION', id, datos, motivoCambio, usuario.username);
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.anular('RESTAURACION', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.reversar('RESTAURACION', id, motivo, usuario.username);
    return this.findOne(id);
  }
}
