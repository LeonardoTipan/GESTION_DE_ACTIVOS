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
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { IndicadorDto } from '../../common/indicadores/indicador.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { indicadoresVulnerabilidad } from './indicadores.js';
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
    private readonly trazas: TrazasService,
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
    if (!query.incluirAnulados) filtros.push({ anuladoEn: null });
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
    // Validado aquí, en el backend: la interfaz solo ofrece equipos operativos,
    // pero la regla no depende de ella.
    await this.activos.exigirOperativo(dto.activoId);
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
    if (actual.anuladoEn) {
      throw new ConflictException(`La vulnerabilidad ${id} está anulada: no admite cambios de estado.`);
    }
    if (!puedeTransicionar(actual.estado, accion)) {
      throw new ConflictException(
        `No se puede ${accion} la vulnerabilidad ${id}: está en estado ${actual.estado}.`,
      );
    }
    const { desde, hacia } = TRANSICIONES[accion];
    const { count } = await this.prisma.vulnerabilidad.updateMany({
      where: { id, estado: { in: desde }, anuladoEn: null },
      data: { ...data, estado: hacia },
    });
    if (count === 0) {
      throw new ConflictException(
        `La vulnerabilidad ${id} cambió de estado mientras se procesaba; vuelve a consultarla.`,
      );
    }
    return this.findOne(id);
  }


  /**
   * Edita con motivo: sube la versión y conserva la anterior en las trazas.
   * Solo mientras está pendiente: una vez cerrada es evidencia y no se toca.
   */
  async update(
    id: number,
    dto: EditarVulnerabilidadDto,
    usuario: AuthUser,
  ): Promise<VulnerabilidadDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    if (actual.anuladoEn) {
      throw new ConflictException(`La vulnerabilidad ${id} está anulada: reviértela antes de editarla.`);
    }
    if (!ESTADOS_ABIERTOS.includes(actual.estado)) {
      throw new ConflictException(
        `La vulnerabilidad ${id} está ${actual.estado}: solo se puede editar mientras está pendiente.`,
      );
    }
    // Las mismas reglas que al registrar, sobre el resultado de la edición.
    const fecha = datos.fecha ?? actual.fecha;
    const fechaLimite = datos.fechaLimite ?? actual.fechaLimite;
    if (fechaLimite && fechaLimite < fecha) {
      throw new BadRequestException(
        'La fecha límite no puede ser anterior a la fecha de detección.',
      );
    }
    if (datos.cve && datos.cve !== actual.cve) {
      const pendiente = await this.prisma.vulnerabilidad.findFirst({
        where: {
          id: { not: id },
          activoId: actual.activoId,
          cve: datos.cve,
          estado: { in: ESTADOS_ABIERTOS },
        },
        select: { id: true },
      });
      if (pendiente) {
        throw new ConflictException(
          `El activo ya tiene ${datos.cve} pendiente (vulnerabilidad ${pendiente.id}).`,
        );
      }
    }
    await this.trazas.modificar('VULNERABILIDAD', id, datos, motivoCambio, usuario.username, { estado: { in: ESTADOS_ABIERTOS } });
    return this.findOne(id);
  }

  /** Eliminación lógica (solo admin): se conserva y deja de contar en los indicadores. */
  async anular(id: number, motivo: string, usuario: AuthUser): Promise<VulnerabilidadDto> {
    await this.findOne(id);
    await this.trazas.anular('VULNERABILIDAD', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Deshace la anulación (solo admin). */
  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<VulnerabilidadDto> {
    await this.findOne(id);
    await this.trazas.reversar('VULNERABILIDAD', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /**
   * Indicadores: los de pendientes, sobre el estado de hoy; los de cierre,
   * sobre las detectadas en el período. Las anuladas no cuentan.
   */
  async indicadores(desde: Date, hasta: Date): Promise<IndicadorDto[]> {
    const [actuales, delPeriodo] = await Promise.all([
      this.prisma.vulnerabilidad.findMany({ where: { anuladoEn: null, ...CON_ACTIVO } }),
      this.prisma.vulnerabilidad.findMany({
        where: { anuladoEn: null, fecha: { gte: desde, lte: hasta }, ...CON_ACTIVO },
      }),
    ]);
    return indicadoresVulnerabilidad(actuales, delPeriodo, new Date());
  }
}

function conVencida(
  vulnerabilidad: VulnerabilidadConActivo,
  ahora = new Date(),
): VulnerabilidadDto {
  return { ...vulnerabilidad, vencida: estaVencida(vulnerabilidad, ahora) };
}
