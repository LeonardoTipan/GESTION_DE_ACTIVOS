import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BitacoraService } from '../bitacora/bitacora.service.js';
import { calcularCambios, cambiosDeCreacion } from '../bitacora/cambios.js';
import type { BitacoraDto } from '../bitacora/dto/bitacora.dto.js';
import type { ActivoDto } from './dto/activo.dto.js';
import type {
  CreateActivoDto,
  UpdateActivoDto,
} from './dto/create-activo.dto.js';
import type { QueryActivosDto } from './dto/query-activos.dto.js';

/** El frontend siempre recibe el activo con su categoría y criticidad. */
const INCLUDE = { categoria: true, criticidad: true } as const;

@Injectable()
export class ActivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
  ) {}

  async findAll(query: QueryActivosDto): Promise<Paginated<ActivoDto>> {
    const where: Prisma.ActivoWhereInput = {
      categoriaId: query.categoriaId,
      criticidadId: query.criticidadId,
      cifrado: query.cifrado,
    };
    if (query.actualizadoDesde) {
      where.updatedAt = { gt: query.actualizadoDesde };
    }
    // En sincronización incremental se incluyen las bajas para que el frontend las retire.
    if (!query.incluirBajas && !query.actualizadoDesde) {
      where.deletedAt = null;
    }
    if (query.q) {
      // La collation de MySQL (utf8mb4_unicode_ci) ya ignora mayúsculas y tildes.
      where.OR = [
        { codigo: { contains: query.q } },
        { nombre: { contains: query.q } },
        { custodio: { contains: query.q } },
        { ubicacion: { contains: query.q } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.activo.count({ where }),
      this.prisma.activo.findMany({
        where,
        include: INCLUDE,
        // Desempate por id: paginación estable aunque haya valores repetidos.
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: number, { incluirBajas = false } = {}): Promise<ActivoDto> {
    const activo = await this.prisma.activo.findFirst({
      where: { id, ...(incluirBajas ? {} : { deletedAt: null }) },
      include: INCLUDE,
    });
    if (!activo) {
      throw new NotFoundException(
        `El activo ${id} no existe o fue dado de baja.`,
      );
    }
    return activo;
  }

  async create(dto: CreateActivoDto, user: AuthUser): Promise<ActivoDto> {
    await this.verificarCatalogos(dto);
    return this.prisma.$transaction(async (tx) => {
      const activo = await tx.activo.create({ data: dto, include: INCLUDE });
      await this.bitacora.registrar(tx, {
        activoId: activo.id,
        accion: 'CREAR',
        responsable: user.username,
        cambios: cambiosDeCreacion(dto),
      });
      return activo;
    });
  }

  async update(
    id: number,
    dto: UpdateActivoDto,
    user: AuthUser,
  ): Promise<ActivoDto> {
    await this.verificarCatalogos(dto);
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.activo.findFirst({
        where: { id, deletedAt: null },
      });
      if (!actual) {
        throw new NotFoundException(
          `El activo ${id} no existe o fue dado de baja.`,
        );
      }

      const cambios = calcularCambios(actual, dto);
      if (Object.keys(cambios).length === 0) {
        // Nada cambió: no se toca updatedAt ni se ensucia la bitácora.
        return tx.activo.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      }

      const activo = await tx.activo.update({
        where: { id },
        data: dto,
        include: INCLUDE,
      });
      await this.bitacora.registrar(tx, {
        activoId: id,
        accion: 'ACTUALIZAR',
        responsable: user.username,
        cambios,
      });
      return activo;
    });
  }

  /** Baja lógica: el activo deja de listarse, pero conserva su historial. */
  async remove(id: number, user: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.activo.findFirst({
        where: { id, deletedAt: null },
      });
      if (!actual) {
        throw new NotFoundException(
          `El activo ${id} no existe o fue dado de baja.`,
        );
      }
      const deletedAt = new Date();
      await tx.activo.update({ where: { id }, data: { deletedAt } });
      await this.bitacora.registrar(tx, {
        activoId: id,
        accion: 'DAR_DE_BAJA',
        responsable: user.username,
        cambios: calcularCambios(actual, { deletedAt }),
      });
    });
  }

  /** El historial se puede consultar también de activos dados de baja. */
  async historial(
    id: number,
    paginacion: PaginationQueryDto,
  ): Promise<Paginated<BitacoraDto>> {
    await this.findOne(id, { incluirBajas: true });
    return this.bitacora.listarPorActivo(id, paginacion);
  }

  /** 400 claro si la categoría o criticidad no existen (en vez de un error de clave foránea). */
  private async verificarCatalogos(dto: {
    categoriaId?: number;
    criticidadId?: number;
  }): Promise<void> {
    if (
      dto.categoriaId !== undefined &&
      !(await this.prisma.categoria.findUnique({
        where: { id: dto.categoriaId },
      }))
    ) {
      throw new BadRequestException(
        `La categoría ${dto.categoriaId} no existe.`,
      );
    }
    if (
      dto.criticidadId !== undefined &&
      !(await this.prisma.criticidad.findUnique({
        where: { id: dto.criticidadId },
      }))
    ) {
      throw new BadRequestException(
        `La criticidad ${dto.criticidadId} no existe.`,
      );
    }
  }
}
