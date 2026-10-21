import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO, type ActivoBreveDto } from '../common/dto/registro.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { TipoAcceso } from '../generated/prisma/enums.js';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CategoriaElegibleDto,
  CerrarControlAccesoDto,
  ControlAccesoDto,
  CrearControlAccesoDto,
  EditarControlAccesoDto,
  HistorialControlAccesoDto,
  QueryActivosElegiblesDto,
  QueryControlAccesoDto,
  ReabrirControlAccesoDto,
} from './dto.js';
import {
  cambiosAuditables,
  codigoDe,
  errorFechaAtendido,
  MARGEN_FUTURO_MS,
  puedeTransitar,
  TRANSICIONES,
  type AccionEstado,
  type Cambio,
} from './reglas.js';

type Tx = Prisma.TransactionClient;
const INCLUDE = { activo: SELECT_ACTIVO } as const;
type Fila = Prisma.ControlAccesoGetPayload<{ include: typeof INCLUDE }>;

const NOMBRE_TIPO: Record<TipoAcceso, string> = { LOGICO: 'lógico', FISICO: 'físico' };
/** Reintentos si, aun así, un código chocara con uno existente (contador alterado a mano). */
const INTENTOS_CODIGO = 3;
/**
 * Altas simultáneas: esperan su turno en el pool de conexiones (por defecto Prisma
 * solo espera 2 s) y luego, en orden, el bloqueo de fila del contador.
 */
const TRANSACCION = { maxWait: 15_000, timeout: 15_000 };

const esUnicoDuplicado = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/**
 * Control de acceso: solicitudes de acceso lógico y físico en una sola tabla.
 * Cada cambio y su registro en el historial van en la MISMA transacción: si la
 * auditoría falla, el cambio se revierte. El usuario del historial sale del token.
 */
@Injectable()
export class ControlAccesoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
  ) {}

  // ── Consultas ─────────────────────────────────────────────────────────────

  async findAll(q: QueryControlAccesoDto): Promise<Paginated<ControlAccesoDto>> {
    const condiciones: Prisma.ControlAccesoWhereInput[] = [];
    if (q.tipoAcceso) condiciones.push({ tipoAcceso: q.tipoAcceso });
    if (q.estado) condiciones.push({ estado: q.estado });
    if (q.tipoSolicitud) condiciones.push({ tipoSolicitud: q.tipoSolicitud });
    if (q.desde || q.hasta) condiciones.push({ fechaSolicitud: { gte: q.desde, lte: q.hasta } });
    if (q.q) {
      condiciones.push({
        OR: [
          { codigoUnico: { contains: q.q } },
          { nombreSolicitante: { contains: q.q } },
          { nombreUsuarioBeneficiario: { contains: q.q } },
          { departamento: { contains: q.q } },
          { recurso: { contains: q.q } },
          { activo: { is: { OR: [{ codigo: { contains: q.q } }, { nombre: { contains: q.q } }] } } },
        ],
      });
    }
    const where: Prisma.ControlAccesoWhereInput = condiciones.length ? { AND: condiciones } : {};
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.controlAcceso.count({ where }),
      this.prisma.controlAcceso.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(filas.map((f) => this.aDto(f)), total, q);
  }

  async findOne(id: number): Promise<ControlAccesoDto> {
    return this.aDto(await this.fila(id));
  }

  async historial(id: number): Promise<HistorialControlAccesoDto[]> {
    await this.fila(id);
    return this.prisma.historialControlAcceso.findMany({
      where: { controlAccesoId: id },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      select: { id: true, campo: true, valorAnterior: true, valorNuevo: true, usuario: true, fecha: true, motivo: true },
    });
  }

  // ── Activos elegibles (filtrados en la base, no en el navegador) ─────────────

  /**
   * Activos vigentes y operativos (la misma regla que el resto de módulos) cuya
   * categoría admite el tipo de acceso. La elegibilidad la marca el admin en
   * Catálogos; la sincronización con GLPI no la toca.
   */
  private elegible(tipo: TipoAcceso): Prisma.ActivoWhereInput {
    return {
      AND: [
        this.activos.filtroOperativo(),
        { categoria: tipo === 'LOGICO' ? { admiteAccesoLogico: true } : { admiteAccesoFisico: true } },
      ],
    };
  }

  async activosElegibles(q: QueryActivosElegiblesDto): Promise<Paginated<ActivoBreveDto>> {
    const condiciones: Prisma.ActivoWhereInput[] = [this.elegible(q.tipoAcceso)];
    if (q.categoriaId) condiciones.push({ categoriaId: q.categoriaId });
    if (q.q) condiciones.push({ OR: [{ codigo: { contains: q.q } }, { nombre: { contains: q.q } }] });
    const where: Prisma.ActivoWhereInput = { AND: condiciones };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.activo.count({ where }),
      this.prisma.activo.findMany({ where, ...SELECT_ACTIVO, orderBy: { codigo: 'asc' }, skip: skipFor(q), take: q.limit }),
    ]);
    return paginate(filas.map(activoBreve), total, q);
  }

  async categoriasElegibles(tipo: TipoAcceso): Promise<CategoriaElegibleDto[]> {
    const grupos = await this.prisma.activo.groupBy({ by: ['categoriaId'], where: this.elegible(tipo), _count: { _all: true } });
    const nombres = await this.prisma.categoria.findMany({
      where: { id: { in: grupos.map((g) => g.categoriaId) } },
      select: { id: true, nombre: true },
    });
    const nombre = new Map(nombres.map((c) => [c.id, c.nombre]));
    return grupos
      .map((g) => ({ categoriaId: g.categoriaId, nombre: nombre.get(g.categoriaId) ?? '', total: g._count._all }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  // ── Alta ──────────────────────────────────────────────────────────────────

  /**
   * Registra la solicitud en ABIERTO con su código (CAL-/CAF-nnn). El correlativo
   * sale del contador por tipo, incrementado con UPDATE dentro de la transacción:
   * el bloqueo de fila serializa las altas simultáneas. Si aun así el código
   * chocara (contador alterado a mano), se reintenta con el siguiente.
   */
  async crear(dto: CrearControlAccesoDto, u: AuthUser): Promise<ControlAccesoDto> {
    const datos = await this.validar({
      tipoAcceso: dto.tipoAcceso,
      activoId: dto.activoId ?? null,
      recurso: dto.recurso ?? null,
      fechaSolicitud: dto.fechaSolicitud,
    });
    for (let intento = 1; ; intento++) {
      try {
        const creada = await this.prisma.$transaction(async (tx) => {
          const codigoUnico = await this.siguienteCodigo(tx, dto.tipoAcceso);
          const fila = await tx.controlAcceso.create({
            data: {
              codigoUnico,
              tipoAcceso: dto.tipoAcceso,
              tipoSolicitud: dto.tipoSolicitud,
              activoId: datos.activoId,
              recurso: datos.recurso,
              fechaSolicitud: dto.fechaSolicitud,
              nombreSolicitante: dto.nombreSolicitante,
              cargoSolicitante: dto.cargoSolicitante,
              nombreUsuarioBeneficiario: dto.nombreUsuarioBeneficiario,
              departamento: dto.departamento,
              descripcion: dto.descripcion,
            },
            include: INCLUDE,
          });
          await this.auditar(tx, fila.id, [{ campo: 'CREACION', valorAnterior: null, valorNuevo: codigoUnico }], u.username);
          return fila;
        }, TRANSACCION);
        return this.aDto(creada);
      } catch (e) {
        if (esUnicoDuplicado(e) && intento < INTENTOS_CODIGO) continue;
        throw e;
      }
    }
  }

  private async siguienteCodigo(tx: Tx, tipo: TipoAcceso): Promise<string> {
    const contador = await tx.contadorControlAcceso.upsert({
      where: { tipoAcceso: tipo },
      create: { tipoAcceso: tipo, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    return codigoDe(tipo, contador.ultimo);
  }

  // ── Modificación ──────────────────────────────────────────────────────────

  /**
   * Modifica los campos editables. Abierta o pendiente: admin y analista; la
   * fecha atendida y la resolución todavía no existen. Cerrada: solo un admin la
   * corrige, con motivo (≥20), incluidas la fecha atendida y la resolución.
   * Cambiar el tipo de acceso solo cabe en ABIERTO y le asigna un código de la
   * otra serie; todos los cambios se auditan con el usuario de la sesión.
   */
  async editar(id: number, dto: EditarControlAccesoDto, u: AuthUser): Promise<ControlAccesoDto> {
    const actual = await this.fila(id);
    const cerrada = actual.estado === 'CERRADO';
    if (cerrada) {
      if (!u.roles.includes('admin')) {
        throw new ForbiddenException(`La solicitud ${actual.codigoUnico} está cerrada: solo un administrador puede corregirla.`);
      }
      if (!dto.motivo || dto.motivo.trim().length < 20) {
        throw new BadRequestException('Corregir una solicitud cerrada exige el motivo del cambio (mínimo 20 caracteres).');
      }
    } else if (dto.fechaAtendido !== undefined || dto.resolucion !== undefined) {
      throw new BadRequestException('La fecha atendida y la resolución se indican al cerrar la solicitud.');
    }
    const tipoAcceso = dto.tipoAcceso ?? actual.tipoAcceso;
    if (tipoAcceso !== actual.tipoAcceso && actual.estado !== 'ABIERTO') {
      throw new ConflictException('El tipo de acceso solo se cambia mientras la solicitud está ABIERTA.');
    }
    // Activo y recurso se validan juntos: elegir un activo quita el recurso y viceversa.
    const activoId = dto.activoId !== undefined ? dto.activoId : dto.recurso ? null : actual.activoId;
    const recurso = dto.recurso !== undefined ? dto.recurso : activoId ? null : actual.recurso;
    const fechaSolicitud = dto.fechaSolicitud ?? actual.fechaSolicitud;
    const datos = await this.validar({
      tipoAcceso,
      activoId,
      recurso,
      fechaSolicitud,
      // Solo se revalida la elegibilidad si cambia el activo o el tipo: corregir otros datos de
      // una solicitud antigua no falla porque su activo se diera de baja después.
      revalidarActivo: activoId !== actual.activoId || tipoAcceso !== actual.tipoAcceso,
    });
    const fechaAtendido = dto.fechaAtendido ?? actual.fechaAtendido;
    if (cerrada && fechaAtendido) {
      const error = errorFechaAtendido(fechaAtendido, fechaSolicitud);
      if (error) throw new BadRequestException(error);
    }
    const nuevos = {
      tipoAcceso,
      activoId: datos.activoId,
      recurso: datos.recurso,
      fechaSolicitud,
      nombreSolicitante: dto.nombreSolicitante ?? actual.nombreSolicitante,
      cargoSolicitante: dto.cargoSolicitante ?? actual.cargoSolicitante,
      ...(cerrada ? { fechaAtendido, resolucion: dto.resolucion ?? actual.resolucion } : {}),
      nombreUsuarioBeneficiario: dto.nombreUsuarioBeneficiario ?? actual.nombreUsuarioBeneficiario,
      departamento: dto.departamento ?? actual.departamento,
      tipoSolicitud: dto.tipoSolicitud ?? actual.tipoSolicitud,
      descripcion: dto.descripcion ?? actual.descripcion,
    };
    const cambios = cambiosAuditables(actual, nuevos);
    if (cambios.length === 0) return this.aDto(actual);

    const fila = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ControlAccesoUncheckedUpdateInput = { ...nuevos };
      if (tipoAcceso !== actual.tipoAcceso) {
        data.codigoUnico = await this.siguienteCodigo(tx, tipoAcceso);
        cambios.unshift({ campo: 'codigoUnico', valorAnterior: actual.codigoUnico, valorNuevo: data.codigoUnico });
      }
      await this.actualizarSiNoCambio(tx, actual, data);
      await this.auditar(tx, id, cambios, u.username, dto.motivo);
      return tx.controlAcceso.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    return this.aDto(fila);
  }

  // ── Estados ───────────────────────────────────────────────────────────────

  marcarPendiente(id: number, u: AuthUser): Promise<ControlAccesoDto> {
    return this.transitar(id, 'pendiente', u, () => ({}));
  }

  /**
   * Cerrar: exige la resolución y la fecha REAL de la atención, que indica quien
   * cierra (puede ser histórica, anterior al registro; no futura ni anterior a la
   * solicitud). El backend no la sustituye por la hora actual.
   */
  cerrar(id: number, dto: CerrarControlAccesoDto, u: AuthUser): Promise<ControlAccesoDto> {
    return this.transitar(id, 'cerrar', u, (actual) => {
      const error = errorFechaAtendido(dto.fechaAtendido, actual.fechaSolicitud);
      if (error) throw new BadRequestException(error);
      return { resolucion: dto.resolucion, fechaAtendido: dto.fechaAtendido };
    });
  }

  /**
   * Reabrir (solo admin, con motivo): vuelve a PENDIENTE, sin fecha atendida ni
   * resolución porque ya no está atendida. La atención anterior no se pierde: su
   * fecha y su resolución quedan en el historial, como valor anterior, junto al motivo.
   */
  reabrir(id: number, dto: ReabrirControlAccesoDto, u: AuthUser): Promise<ControlAccesoDto> {
    return this.transitar(id, 'reabrir', u, () => ({ resolucion: null, fechaAtendido: null }), dto.motivo);
  }

  private async transitar(
    id: number,
    accion: AccionEstado,
    u: AuthUser,
    extra: (actual: Fila) => { resolucion?: string | null; fechaAtendido?: Date | null },
    motivo?: string,
  ): Promise<ControlAccesoDto> {
    const actual = await this.fila(id);
    if (!puedeTransitar(accion, actual.estado)) {
      throw new ConflictException(
        `La solicitud ${actual.codigoUnico} está ${actual.estado}: no se puede ${accion === 'pendiente' ? 'pasar a PENDIENTE' : accion}.`,
      );
    }
    const nuevos = { estado: TRANSICIONES[accion].hacia, ...extra(actual) };
    const fila = await this.prisma.$transaction(async (tx) => {
      await this.actualizarSiNoCambio(tx, actual, nuevos);
      await this.auditar(tx, id, cambiosAuditables(actual, nuevos), u.username, motivo);
      return tx.controlAcceso.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    return this.aDto(fila);
  }

  /** Actualización condicional: si otra petición la cambió entre medias, 409 (nada se pisa). */
  private async actualizarSiNoCambio(tx: Tx, actual: Fila, data: Prisma.ControlAccesoUncheckedUpdateManyInput): Promise<void> {
    const { count } = await tx.controlAcceso.updateMany({
      where: { id: actual.id, estado: actual.estado, updatedAt: actual.updatedAt },
      data,
    });
    if (count === 0) {
      throw new ConflictException(`La solicitud ${actual.codigoUnico} cambió mientras se guardaba: vuelva a cargarla.`);
    }
  }

  /** Escribe el historial dentro de la transacción del cambio: si falla, se revierte todo. */
  protected async auditar(
    tx: Tx,
    controlAccesoId: number,
    cambios: (Cambio | { campo: 'CREACION'; valorAnterior: null; valorNuevo: string })[],
    usuario: string,
    motivo?: string,
  ): Promise<void> {
    if (cambios.length === 0) return;
    await tx.historialControlAcceso.createMany({
      data: cambios.map((c) => ({ controlAccesoId, ...c, usuario, motivo: motivo ?? null })),
    });
  }

  // ── Validación ────────────────────────────────────────────────────────────

  /**
   * Un activo vigente y elegible para el tipo de acceso, o un recurso descrito;
   * no los dos ni ninguno. La fecha de solicitud no es futura.
   */
  private async validar(d: {
    tipoAcceso: TipoAcceso;
    activoId: number | null;
    recurso: string | null;
    fechaSolicitud: Date;
    /** false = el activo no cambió: no se revalida su elegibilidad. */
    revalidarActivo?: boolean;
  }): Promise<{ activoId: number | null; recurso: string | null }> {
    if (d.fechaSolicitud.getTime() > Date.now() + MARGEN_FUTURO_MS) {
      throw new BadRequestException('La fecha de solicitud no puede ser futura.');
    }
    const recurso = d.recurso?.trim() || null;
    if (d.activoId && recurso) {
      throw new BadRequestException('Indique un activo inventariado o un recurso no inventariado, no ambos.');
    }
    if (!d.activoId) {
      if (!recurso) throw new BadRequestException('Seleccione un activo o describa el recurso (p. ej. «Correo institucional»).');
      return { activoId: null, recurso };
    }
    if (d.revalidarActivo === false) return { activoId: d.activoId, recurso: null };
    const activo = await this.prisma.activo.findUnique({
      where: { id: d.activoId },
      select: { codigo: true, categoria: { select: { nombre: true } } },
    });
    if (!activo) throw new BadRequestException(`El activo ${d.activoId} no existe.`);
    const elegible = await this.prisma.activo.count({ where: { AND: [{ id: d.activoId }, this.elegible(d.tipoAcceso)] } });
    if (elegible === 0) {
      throw new BadRequestException(
        `El activo ${activo.codigo} (${activo.categoria.nombre}) no es elegible para acceso ${NOMBRE_TIPO[d.tipoAcceso]}: ` +
          'no está vigente u operativo, o su categoría no lo admite (Catálogos).',
      );
    }
    return { activoId: d.activoId, recurso: null };
  }

  private async fila(id: number): Promise<Fila> {
    const fila = await this.prisma.controlAcceso.findUnique({ where: { id }, include: INCLUDE });
    if (!fila) throw new NotFoundException(`La solicitud de acceso ${id} no existe.`);
    return fila;
  }

  private aDto(f: Fila): ControlAccesoDto {
    return { ...f, activo: f.activo ? activoBreve(f.activo) : null };
  }
}
