import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AceptarRiesgoDto,
  EditarVulnerabilidadDto,
  MitigarVulnerabilidadDto,
  RegistrarVulnerabilidadDto,
} from './dto/acciones.dto.js';
import type { QueryVulnerabilidadesDto } from './dto/query-vulnerabilidades.dto.js';
import type { VulnerabilidadDto } from './dto/vulnerabilidad.dto.js';
import {
  ESTADOS_ABIERTOS,
  estaVencida,
  puedeTransicionar,
  TRANSICIONES,
  type AccionVulnerabilidad,
} from './transiciones.js';

const INCLUDE = {
  activo: { select: { id: true, codigo: true, nombre: true } },
} as const;

/**
 * Solo registros cuyo activo existe. Las claves foráneas lo garantizan, pero si
 * alguien vacía la tabla de activos saltándoselas, un registro huérfano haría
 * fallar la consulta entera (el activo es obligatorio): se ignora en vez de
 * tumbar el módulo. La sincronización con GLPI los detecta y los denuncia.
 */
const CON_ACTIVO = { activo: { id: { gt: 0 } } } as const;

type VulnerabilidadConActivo = Prisma.VulnerabilidadGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class VulnerabilidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
  ) {}

  async findAll(
    query: QueryVulnerabilidadesDto,
  ): Promise<Paginated<VulnerabilidadDto>> {
    const ahora = new Date();
    const vencidas: Prisma.VulnerabilidadWhereInput = {
      estado: { in: ESTADOS_ABIERTOS },
      fechaLimite: { lt: ahora },
    };
    const filtros: Prisma.VulnerabilidadWhereInput[] = [
      {
        activoId: query.activoId,
        nivelRiesgo: query.nivelRiesgo,
        estado: query.estado,
      },
    ];
    if (query.cve) filtros.push({ cve: { contains: query.cve } });
    if (query.abiertas === true) {
      filtros.push({ estado: { in: ESTADOS_ABIERTOS } });
    }
    if (query.abiertas === false) {
      filtros.push({ estado: { notIn: ESTADOS_ABIERTOS } });
    }
    if (query.vencidas === true) filtros.push(vencidas);
    if (query.vencidas === false) filtros.push({ NOT: vencidas });
    if (query.actualizadoDesde) {
      filtros.push({ updatedAt: { gt: query.actualizadoDesde } });
    }
    const where: Prisma.VulnerabilidadWhereInput = { AND: [...filtros, CON_ACTIVO] };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.vulnerabilidad.count({ where }),
      this.prisma.vulnerabilidad.findMany({
        where,
        include: INCLUDE,
        // Lo más urgente primero: mayor riesgo y, dentro del nivel, la más antigua.
        orderBy: [{ nivelRiesgo: 'desc' }, { fecha: 'asc' }, { id: 'asc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(
      filas.map((v) => conVencida(v, ahora)),
      total,
      query,
    );
  }

  async findOne(id: number): Promise<VulnerabilidadDto> {
    const vulnerabilidad = await this.prisma.vulnerabilidad.findFirst({
      where: { id, ...CON_ACTIVO },
      include: INCLUDE,
    });
    if (!vulnerabilidad) {
      throw new NotFoundException(`La vulnerabilidad ${id} no existe.`);
    }
    return conVencida(vulnerabilidad);
  }

  /** Registra la vulnerabilidad en estado ABIERTA. El activo debe estar vigente. */
  async registrar(dto: RegistrarVulnerabilidadDto): Promise<VulnerabilidadDto> {
    // Validado aquí, en el backend: la interfaz solo ofrece equipos activos,
    // pero la regla no depende de ella.
    await this.activos.exigirActivo(dto.activoId);
    if (dto.fechaLimite && dto.fechaLimite < dto.fecha) {
      throw new BadRequestException(
        'La fecha límite no puede ser anterior a la fecha de detección.',
      );
    }
    if (dto.cve) {
      const pendiente = await this.prisma.vulnerabilidad.findFirst({
        where: {
          activoId: dto.activoId,
          cve: dto.cve,
          estado: { in: ESTADOS_ABIERTOS },
        },
        select: { id: true },
      });
      if (pendiente) {
        throw new ConflictException(
          `El activo ya tiene ${dto.cve} pendiente (vulnerabilidad ${pendiente.id}).`,
        );
      }
    }
    const vulnerabilidad = await this.prisma.vulnerabilidad.create({
      data: dto,
      include: INCLUDE,
    });
    return conVencida(vulnerabilidad);
  }

  iniciarMitigacion(id: number): Promise<VulnerabilidadDto> {
    return this.transicionar(id, 'iniciar-mitigacion', {});
  }

  mitigar(
    id: number,
    dto: MitigarVulnerabilidadDto,
  ): Promise<VulnerabilidadDto> {
    return this.transicionar(id, 'mitigar', {
      mitigacion: dto.mitigacion,
      fechaCierre: new Date(),
    });
  }

  aceptarRiesgo(id: number, dto: AceptarRiesgoDto): Promise<VulnerabilidadDto> {
    return this.transicionar(id, 'aceptar-riesgo', {
      mitigacion: dto.justificacion,
      fechaCierre: new Date(),
    });
  }

  /**
   * Comprueba que la transición está permitida y la aplica con una
   * actualización condicional: si otra petición se adelantó, 409.
   */
  private async transicionar(
    id: number,
    accion: AccionVulnerabilidad,
    data: Prisma.VulnerabilidadUpdateManyMutationInput,
  ): Promise<VulnerabilidadDto> {
    const actual = await this.findOne(id);
    if (!puedeTransicionar(actual.estado, accion)) {
      throw new ConflictException(
        `No se puede ${accion} la vulnerabilidad ${id}: está en estado ${actual.estado}.`,
      );
    }
    const { desde, hacia } = TRANSICIONES[accion];
    const { count } = await this.prisma.vulnerabilidad.updateMany({
      where: { id, estado: { in: desde } },
      data: { ...data, estado: hacia },
    });
    if (count === 0) {
      throw new ConflictException(
        `La vulnerabilidad ${id} cambió de estado mientras se procesaba; vuelve a consultarla.`,
      );
    }
    return this.findOne(id);
  }

  /** Corrige los datos de una vulnerabilidad pendiente. Una vez cerrada es evidencia y no se toca. */
  async update(
    id: number,
    dto: EditarVulnerabilidadDto,
  ): Promise<VulnerabilidadDto> {
    const actual = await this.findOne(id);
    if (!ESTADOS_ABIERTOS.includes(actual.estado)) {
      throw new ConflictException(
        `La vulnerabilidad ${id} está ${actual.estado}: solo se puede editar mientras está pendiente.`,
      );
    }
    // Las mismas reglas que al registrar, sobre el resultado de la edición.
    const fecha = dto.fecha ?? actual.fecha;
    const fechaLimite = dto.fechaLimite ?? actual.fechaLimite;
    if (fechaLimite && fechaLimite < fecha) {
      throw new BadRequestException(
        'La fecha límite no puede ser anterior a la fecha de detección.',
      );
    }
    if (dto.cve && dto.cve !== actual.cve) {
      const pendiente = await this.prisma.vulnerabilidad.findFirst({
        where: {
          id: { not: id },
          activoId: actual.activoId,
          cve: dto.cve,
          estado: { in: ESTADOS_ABIERTOS },
        },
        select: { id: true },
      });
      if (pendiente) {
        throw new ConflictException(
          `El activo ya tiene ${dto.cve} pendiente (vulnerabilidad ${pendiente.id}).`,
        );
      }
    }
    const { count } = await this.prisma.vulnerabilidad.updateMany({
      where: { id, estado: { in: ESTADOS_ABIERTOS } },
      data: dto,
    });
    if (count === 0) {
      throw new ConflictException(
        `La vulnerabilidad ${id} cambió de estado mientras se editaba; vuelve a consultarla.`,
      );
    }
    return this.findOne(id);
  }

  /** Borrado definitivo (solo admin). El activo y su bitácora no se ven afectados. */
  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.vulnerabilidad.delete({ where: { id } });
  }
}

function conVencida(
  vulnerabilidad: VulnerabilidadConActivo,
  ahora = new Date(),
): VulnerabilidadDto {
  return { ...vulnerabilidad, vencida: estaVencida(vulnerabilidad, ahora) };
}
