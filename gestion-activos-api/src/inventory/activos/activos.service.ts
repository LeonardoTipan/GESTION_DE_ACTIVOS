import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { ActivoDto, EstadoActivoDto } from './dto/activo.dto.js';
import type {
  CreateActivoDto,
  UpdateActivoDto,
} from './dto/create-activo.dto.js';
import {
  ESTADO_BAJA,
  ESTADO_SIN_ESTADO,
  type QueryActivosDto,
} from './dto/query-activos.dto.js';

/**
 * Equipo VIGENTE: no se dio de baja en la aplicación ni la sincronización lo
 * marcó (papelera de GLPI o ya inexistente allí). Los que no lo están se
 * muestran con el estado "Dado de baja".
 */
const VIGENTE = { deletedAt: null, inactivoDesde: null } as const;

/** Estados que, por defecto, impiden operar con el equipo (ESTADOS_NO_OPERATIVOS). */
const NO_OPERATIVOS_POR_DEFECTO = 'Dado de baja,Inactivo,Desechado';

/** El frontend siempre recibe el activo con su categoría y criticidad. */
const INCLUDE = { categoria: true, criticidad: true } as const;

@Injectable()
export class ActivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Estados (de GLPI) con los que un equipo NO admite respaldos, mantenimientos
   * ni vulnerabilidades nuevos. Configurable: ESTADOS_NO_OPERATIVOS, separados por comas.
   */
  private estadosNoOperativos(): string[] {
    return (
      this.config.get<string>('ESTADOS_NO_OPERATIVOS') ?? NO_OPERATIVOS_POR_DEFECTO
    )
      .split(',')
      .map((estado) => estado.trim())
      .filter(Boolean);
  }

  private esNoOperativo(estado: string | null): boolean {
    const clave = estado?.trim().toLowerCase();
    return (
      clave !== undefined &&
      this.estadosNoOperativos().some((e) => e.toLowerCase() === clave)
    );
  }

  /** Vigente y en un estado que permite operar (sin estado también cuenta). */
  filtroOperativo(): Prisma.ActivoWhereInput {
    const excluidos = this.estadosNoOperativos();
    return excluidos.length === 0
      ? VIGENTE
      : {
          ...VIGENTE,
          // NOT IN descarta los NULL en SQL: los equipos sin estado se incluyen aparte.
          OR: [{ estado: null }, { estado: { notIn: excluidos } }],
        };
  }

  /**
   * Los estados que hay REALMENTE en el inventario, con cuántos equipos tiene
   * cada uno: alimenta el filtro dinámico. No es una lista fija: si GLPI
   * empieza a enviar un estado nuevo, aparece solo.
   */
  async estados(): Promise<EstadoActivoDto[]> {
    const [grupos, bajas] = await Promise.all([
      this.prisma.activo.groupBy({
        by: ['estado'],
        where: VIGENTE,
        _count: { _all: true },
        orderBy: { estado: 'asc' },
      }),
      this.prisma.activo.count({ where: { NOT: VIGENTE } }),
    ]);
    const estados: EstadoActivoDto[] = grupos.map((grupo) => ({
      clave: grupo.estado ?? ESTADO_SIN_ESTADO,
      etiqueta: grupo.estado ?? 'Sin estado',
      total: grupo._count._all,
      operativo: !this.esNoOperativo(grupo.estado),
    }));
    if (bajas > 0) {
      estados.push({
        clave: ESTADO_BAJA,
        etiqueta: 'Dado de baja',
        total: bajas,
        operativo: false,
      });
    }
    return estados;
  }

  async findAll(query: QueryActivosDto): Promise<Paginated<ActivoDto>> {
    const where: Prisma.ActivoWhereInput = {
      categoriaId: query.categoriaId,
      criticidadId: query.criticidadId,
      cifrado: query.cifrado,
    };
    if (query.actualizadoDesde) {
      where.updatedAt = { gt: query.actualizadoDesde };
    }
    const condiciones: Prisma.ActivoWhereInput[] = [];
    if (query.estado === ESTADO_BAJA) condiciones.push({ NOT: VIGENTE });
    else if (query.estado === ESTADO_SIN_ESTADO) {
      condiciones.push({ ...VIGENTE, estado: null });
    } else if (query.estado) {
      // Un equipo dado de baja se muestra como tal, no con su último estado de GLPI.
      condiciones.push({ ...VIGENTE, estado: query.estado });
    }
    if (query.operativos) condiciones.push(this.filtroOperativo());
    if (condiciones.length > 0) where.AND = condiciones;
    if (query.q) {
      // La collation de MySQL (utf8mb4_unicode_ci) ya ignora mayúsculas y tildes.
      where.OR = [
        { codigo: { contains: query.q } },
        { nombre: { contains: query.q } },
        { custodio: { contains: query.q } },
        { ubicacion: { contains: query.q } },
        { numeroInventario: { contains: query.q } },
        { codigoInstitucional: { contains: query.q } },
        { numeroSerie: { contains: query.q } },
        { fabricante: { contains: query.q } },
        { modelo: { contains: query.q } },
        // También por categoría (tipo de GLPI), referencia de GLPI («Monitor #7») o id.
        { categoria: { nombre: { contains: query.q } } },
        { origenGlpi: { contains: query.q } },
        ...(/^\d+$/.test(query.q) ? [{ id: Number(query.q) }] : []),
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

  /** La ficha se conserva siempre: también la de un equipo dado de baja. */
  async findOne(id: number): Promise<ActivoDto> {
    const activo = await this.prisma.activo.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!activo) {
      throw new NotFoundException(`El activo ${id} no existe.`);
    }
    return activo;
  }

  /**
   * Para registrar una operación NUEVA (respaldo, mantenimiento, vulnerabilidad):
   * el equipo debe existir y estar OPERATIVO: ni dado de baja ni en un estado
   * de ESTADOS_NO_OPERATIVOS. Los registros anteriores se conservan y se
   * siguen consultando.
   */
  async exigirOperativo(id: number): Promise<void> {
    const activo = await this.prisma.activo.findUnique({
      where: { id },
      select: {
        codigo: true,
        estado: true,
        deletedAt: true,
        inactivoDesde: true,
        motivoInactivo: true,
      },
    });
    if (!activo) {
      throw new BadRequestException(`El activo ${id} no existe.`);
    }
    const motivo = activo.deletedAt
      ? 'fue dado de baja'
      : activo.inactivoDesde
        ? activo.motivoInactivo === 'PAPELERA_GLPI'
          ? 'está en la papelera de GLPI'
          : 'ya no existe en GLPI'
        : this.esNoOperativo(activo.estado)
          ? `su estado es "${activo.estado}"`
          : null;
    if (motivo) {
      throw new BadRequestException(
        `El activo ${activo.codigo} no está operativo (${motivo}): no admite operaciones nuevas. Sus registros anteriores se conservan.`,
      );
    }
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
    await this.findOne(id);
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
