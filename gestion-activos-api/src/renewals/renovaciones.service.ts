import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MOTIVO_MINIMO } from '../audit/dto/traza.dto.js';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../common/dto/registro.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { EstadoRenovacion } from '../generated/prisma/enums.js';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActualizarEjecucionDto,
  CrearRenovacionDto,
  DatosEjecucionDto,
  EditarPlanificacionDto,
  QueryCaducidadesDto,
  QueryRenovacionesDto,
  ReabrirRenovacionDto,
  RenovacionDto,
  ResumenVigenciasDto,
  VIGENCIAS,
} from './dto.js';
import { diasAviso, exigirCaducidadActual, exigirCierre, exigirCoherencia, fechaDia, hoy, venceEl, vigencia } from './reglas.js';

const PENDIENTES: EstadoRenovacion[] = ['ABIERTO', 'EN_PROGRESO'];
const MS_DIA = 86_400_000;

const INCLUDE = {
  activo: SELECT_ACTIVO,
  anterior: { select: { id: true, fechaRenovacion: true, nuevaFechaCaducidad: true } },
  // Una renovación posterior (no anulada) del mismo elemento la sustituye.
  siguientes: { where: { anuladoEn: null }, select: { id: true }, orderBy: { id: 'asc' as const }, take: 1 },
} as const;

type RenovacionCompleta = Prisma.RenovacionGetPayload<{ include: typeof INCLUDE }>;

/** Quita las claves sin valor: lo no enviado no cambia. */
const definidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Sin renovación posterior vigente: la que rige hoy para ese elemento. */
const NO_SUSTITUIDA: Prisma.RenovacionWhereInput = { siguientes: { none: { anuladoEn: null } } };

/**
 * Renovaciones en DOS fases sobre el mismo registro:
 *   Planificación (ABIERTO): sistema, tipo, responsable, fecha planificada y la
 *     caducidad actual (o «sin caducidad» justificado).
 *   Ejecución y cierre (EN_PROGRESO → CERRADO): fecha REAL de renovación, nueva
 *     caducidad, verificable, repositorio, descripción y observación.
 * El activo de GLPI nunca se modifica. Todo cambio pasa por la auditoría común
 * (registro_cambio) en la misma transacción, con el usuario de la sesión.
 */
@Injectable()
export class RenovacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  // ── Consultas ─────────────────────────────────────────────────────────────

  async findAll(q: QueryRenovacionesDto): Promise<Paginated<RenovacionDto>> {
    const filtros: Prisma.RenovacionWhereInput[] = [
      {
        activoId: q.activoId,
        tipo: q.tipo,
        estado: q.estado,
        ...(q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {}),
        ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
      },
    ];
    if (q.pendientes === true) filtros.push({ estado: { in: PENDIENTES } });
    if (q.pendientes === false) filtros.push({ estado: 'CERRADO' });
    if (q.vigencia) filtros.push(this.filtroVigencia(q.vigencia));
    if (q.caducaDesde || q.caducaHasta) filtros.push(NO_SUSTITUIDA, this.venceEntre(q.caducaDesde, q.caducaHasta));
    if (q.q) {
      filtros.push({
        OR: [
          { activo: { codigo: { contains: q.q } } },
          { activo: { nombre: { contains: q.q } } },
          { descripcion: { contains: q.q } },
          { evidencia: { contains: q.q } },
        ],
      });
    }
    if (!q.incluirAnulados) filtros.push({ anuladoEn: null });
    const where: Prisma.RenovacionWhereInput = { AND: filtros };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.renovacion.count({ where }),
      this.prisma.renovacion.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fechaPlanificada: 'desc' }, { id: 'desc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(filas.map((r) => aDto(r)), total, q);
  }

  async findOne(id: number): Promise<RenovacionDto> {
    const r = await this.prisma.renovacion.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException(`La renovación ${id} no existe.`);
    return aDto(r);
  }

  /** Cuántos elementos están vigentes, próximos a caducar, caducados o sin caducidad (sin contar los sustituidos). */
  async resumen(): Promise<ResumenVigenciasDto> {
    const contar = (v: (typeof VIGENCIAS)[number]) => this.prisma.renovacion.count({ where: { AND: [{ anuladoEn: null }, this.filtroVigencia(v)] } });
    const [vigentes, proximas, caducadas, sinCaducidad] = await Promise.all([
      contar('VIGENTE'),
      contar('PROXIMA'),
      contar('CADUCADA'),
      contar('SIN_CADUCIDAD'),
    ]);
    return { diasAviso: diasAviso(), vigentes, proximas, caducadas, sinCaducidad };
  }

  /**
   * Próximas caducidades: lo que caduca en los próximos `dias` (por defecto el umbral)
   * y lo ya caducado, de lo que rige hoy (no sustituido), de la más urgente a la menos.
   */
  async caducidades(q: QueryCaducidadesDto): Promise<RenovacionDto[]> {
    const hasta = new Date(fechaDia(hoy()).getTime() + (q.dias ?? diasAviso()) * MS_DIA);
    const filas = await this.prisma.renovacion.findMany({
      where: { AND: [{ anuladoEn: null }, NO_SUSTITUIDA, this.venceEntre(undefined, hasta)] },
      include: INCLUDE,
      take: 500,
    });
    return filas.map((r) => aDto(r)).sort((a, b) => a.venceEl!.getTime() - b.venceEl!.getTime());
  }

  // ── Fase 1 · Planificación ────────────────────────────────────────────────

  /**
   * Planifica una renovación en ABIERTO. Si el mismo elemento (activo y tipo) ya
   * se renovó, se enlaza con esa renovación: la anterior queda sustituida y sus
   * fechas se conservan. No admite dos renovaciones pendientes del mismo elemento.
   */
  async crear(dto: CrearRenovacionDto, usuario: AuthUser): Promise<RenovacionDto> {
    await this.activos.exigirOperativo(dto.activoId);
    exigirCaducidadActual(dto);
    await this.exigirSinPendiente(dto.activoId, dto.tipo);
    const id = await this.prisma.$transaction(async (tx) => {
      const anterior = await this.anteriorDe(tx, dto.activoId, dto.tipo);
      const r = await tx.renovacion.create({
        data: {
          activoId: dto.activoId,
          tipo: dto.tipo,
          responsable: dto.responsable,
          fechaPlanificada: dto.fechaPlanificada,
          fechaCaducidadActual: dto.fechaCaducidadActual ?? null,
          sinCaducidadActual: dto.sinCaducidadActual ?? false,
          observacion: dto.observacion,
          estado: 'ABIERTO',
          renovacionAnteriorId: anterior,
        },
      });
      await this.trazas.registrarAlta(
        tx,
        'RENOVACION',
        r.id,
        {
          activoId: r.activoId,
          tipo: r.tipo,
          responsable: r.responsable,
          fechaPlanificada: r.fechaPlanificada,
          fechaCaducidadActual: r.fechaCaducidadActual,
          sinCaducidadActual: r.sinCaducidadActual || undefined,
          estado: r.estado,
          renovacionAnteriorId: r.renovacionAnteriorId,
        },
        'Renovación planificada (fase de Planificación).',
        usuario.username,
      );
      return r.id;
    });
    return this.findOne(id);
  }

  /** Corrige la planificación con motivo, mientras está pendiente (activo y tipo, solo ABIERTO). */
  async editarPlanificacion(id: number, dto: EditarPlanificacionDto, usuario: AuthUser): Promise<RenovacionDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.exigirVigente(id);
    if (!PENDIENTES.includes(actual.estado)) {
      throw new ConflictException(`La renovación ${id} está CERRADA: reábrala para corregir su planificación.`);
    }
    const cambiaElemento = (datos.activoId !== undefined && datos.activoId !== actual.activoId) || (datos.tipo !== undefined && datos.tipo !== actual.tipo);
    if (cambiaElemento && actual.estado !== 'ABIERTO') {
      throw new ConflictException('El sistema y el tipo solo se cambian mientras la renovación está ABIERTA.');
    }
    const activoId = datos.activoId ?? actual.activoId;
    const tipo = datos.tipo ?? actual.tipo;
    if (datos.activoId !== undefined && datos.activoId !== actual.activoId) await this.activos.exigirOperativo(datos.activoId);
    if (cambiaElemento) await this.exigirSinPendiente(activoId, tipo, id);
    const sinCaducidadActual = datos.sinCaducidadActual ?? actual.sinCaducidadActual;
    const resultado = {
      fechaCaducidadActual: sinCaducidadActual ? null : (datos.fechaCaducidadActual ?? actual.fechaCaducidadActual),
      sinCaducidadActual,
      observacion: datos.observacion ?? actual.observacion,
    };
    exigirCaducidadActual(resultado);
    // La nueva caducidad ya registrada debe seguir siendo posterior a la caducidad actual corregida.
    exigirCoherencia({ ...this.combinar(actual, {}), fechaCaducidadActual: resultado.fechaCaducidadActual });
    const cambios: Record<string, unknown> = definidos({
      ...datos,
      fechaCaducidadActual: resultado.fechaCaducidadActual,
      sinCaducidadActual,
      // Otro elemento: se recalcula con qué renovación anterior enlaza (queda en la traza).
      renovacionAnteriorId: cambiaElemento ? await this.anteriorDe(this.prisma, activoId, tipo, id) : undefined,
    });
    await this.trazas.modificar('RENOVACION', id, cambios, motivoCambio, usuario.username, { estado: { in: PENDIENTES } });
    return this.findOne(id);
  }

  // ── Fase 2 · Ejecución y cierre ───────────────────────────────────────────

  /** ABIERTO → EN_PROGRESO. */
  iniciar(id: number, usuario: AuthUser): Promise<RenovacionDto> {
    return this.transicionar(id, ['ABIERTO'], 'EN_PROGRESO', {}, 'Renovación en ejecución.', usuario);
  }

  /**
   * Guarda o corrige lo ejecutado SIN cambiar el estado: escribir una fecha no
   * cierra. Pendiente: admin y analista. CERRADA: solo admin, con motivo, y sin
   * dejar de cumplir los requisitos de cierre.
   */
  async actualizarEjecucion(id: number, dto: ActualizarEjecucionDto, usuario: AuthUser): Promise<RenovacionDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.exigirVigente(id);
    const cerrada = actual.estado === 'CERRADO';
    if (cerrada && !usuario.roles.includes('admin')) {
      throw new ForbiddenException(`La renovación ${id} está CERRADA: solo un administrador corrige su ejecución.`);
    }
    if (cerrada && (motivoCambio?.trim().length ?? 0) < MOTIVO_MINIMO) {
      throw new BadRequestException(`Para corregir una renovación cerrada indique el motivo (al menos ${MOTIVO_MINIMO} caracteres).`);
    }
    const resultado = this.combinar(actual, datos);
    if (cerrada) exigirCierre(resultado);
    else exigirCoherencia(resultado);
    await this.trazas.modificar(
      'RENOVACION',
      id,
      this.cambiosEjecucion(datos),
      cerrada ? motivoCambio!.trim() : motivoCambio?.trim() || 'Datos de la ejecución actualizados.',
      usuario.username,
      { estado: actual.estado },
    );
    return this.findOne(id);
  }

  /**
   * → CERRADO. Exige la fecha REAL de renovación (manual), la nueva caducidad (o
   * «sin caducidad» justificado), el verificable y su repositorio. La caducidad
   * actual se conserva: la nueva va en su propio campo.
   */
  async cerrar(id: number, dto: DatosEjecucionDto, usuario: AuthUser): Promise<RenovacionDto> {
    const actual = await this.findOne(id);
    exigirCierre(this.combinar(actual, dto));
    return this.transicionar(
      id,
      PENDIENTES,
      'CERRADO',
      { ...this.cambiosEjecucion(dto), cerradaPor: usuario.username },
      'Renovación ejecutada y cerrada.',
      usuario,
    );
  }

  /**
   * CERRADO → EN_PROGRESO con motivo. Se vacían la fecha de renovación y la nueva
   * caducidad vigentes (las anteriores quedan en la auditoría). No se reabre una
   * renovación ya sustituida por otra posterior.
   */
  async reabrir(id: number, dto: ReabrirRenovacionDto, usuario: AuthUser): Promise<RenovacionDto> {
    const actual = await this.findOne(id);
    if (actual.sustituidaPor) {
      throw new ConflictException(`La renovación ${id} ya fue sustituida por la ${actual.sustituidaPor}: corrija esa en su lugar.`);
    }
    return this.transicionar(
      id,
      ['CERRADO'],
      'EN_PROGRESO',
      { fechaRenovacion: null, nuevaFechaCaducidad: null, nuevaSinCaducidad: false, cerradaPor: null },
      `Reabierta: ${dto.motivo}`.slice(0, 5000),
      usuario,
    );
  }

  // ── Registro: anulación lógica ────────────────────────────────────────────

  async anular(id: number, motivo: string, usuario: AuthUser): Promise<RenovacionDto> {
    await this.findOne(id);
    await this.trazas.anular('RENOVACION', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<RenovacionDto> {
    await this.findOne(id);
    await this.trazas.reversar('RENOVACION', id, motivo, usuario.username);
    return this.findOne(id);
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  /** Cambio de estado con la auditoría común: condicional (si cambió entretanto, 409) y con traza en la misma transacción. */
  private async transicionar(
    id: number,
    desde: EstadoRenovacion[],
    hacia: EstadoRenovacion,
    data: Record<string, unknown>,
    motivo: string,
    usuario: AuthUser,
  ): Promise<RenovacionDto> {
    const actual = await this.exigirVigente(id);
    if (!desde.includes(actual.estado)) {
      throw new ConflictException(`La renovación ${id} está ${actual.estado}: no puede pasar a ${hacia}.`);
    }
    await this.trazas.modificar('RENOVACION', id, { ...data, estado: hacia }, motivo, usuario.username, { estado: { in: desde } });
    return this.findOne(id);
  }

  private async exigirVigente(id: number): Promise<RenovacionDto> {
    const r = await this.findOne(id);
    if (r.anuladoEn) throw new ConflictException(`La renovación ${id} está anulada: reviértala antes de modificarla.`);
    return r;
  }

  /** Un elemento (activo y tipo) solo tiene una renovación pendiente a la vez. */
  private async exigirSinPendiente(activoId: number, tipo: RenovacionDto['tipo'], salvo?: number): Promise<void> {
    const pendiente = await this.prisma.renovacion.findFirst({
      where: { activoId, tipo, estado: { in: PENDIENTES }, anuladoEn: null, ...(salvo ? { id: { not: salvo } } : {}) },
      select: { id: true },
    });
    if (pendiente) throw new ConflictException(`Ese elemento ya tiene una renovación pendiente (la ${pendiente.id}).`);
  }

  /** La última renovación CERRADA y aún no sustituida del mismo elemento (para enlazar la cadena). */
  private async anteriorDe(tx: Prisma.TransactionClient, activoId: number, tipo: RenovacionDto['tipo'], salvo?: number): Promise<number | null> {
    const anterior = await tx.renovacion.findFirst({
      where: {
        activoId,
        tipo,
        estado: 'CERRADO',
        anuladoEn: null,
        ...(salvo ? { id: { not: salvo } } : {}),
        siguientes: { none: { anuladoEn: null, ...(salvo ? { id: { not: salvo } } : {}) } },
      },
      orderBy: [{ fechaRenovacion: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return anterior?.id ?? null;
  }

  /** Lo guardado más lo enviado: así se valida el resultado, no solo lo que cambia. */
  private combinar(actual: RenovacionDto, d: DatosEjecucionDto) {
    const nuevaSinCaducidad = d.nuevaSinCaducidad ?? actual.nuevaSinCaducidad;
    return {
      fechaCaducidadActual: actual.fechaCaducidadActual,
      fechaRenovacion: d.fechaRenovacion ?? actual.fechaRenovacion,
      nuevaFechaCaducidad: nuevaSinCaducidad ? (d.nuevaFechaCaducidad ?? null) : (d.nuevaFechaCaducidad ?? actual.nuevaFechaCaducidad),
      nuevaSinCaducidad,
      evidencia: d.evidencia ?? actual.evidencia,
      repositorioVerificable: d.repositorioVerificable ?? actual.repositorioVerificable,
      observacion: d.observacion ?? actual.observacion,
    };
  }

  /** Marcar «sin caducidad» vacía la nueva fecha (lo anterior queda en la traza). */
  private cambiosEjecucion(d: DatosEjecucionDto): Record<string, unknown> {
    return definidos({
      fechaRenovacion: d.fechaRenovacion,
      nuevaFechaCaducidad: d.nuevaSinCaducidad ? null : d.nuevaFechaCaducidad,
      nuevaSinCaducidad: d.nuevaSinCaducidad,
      evidencia: d.evidencia,
      repositorioVerificable: d.repositorioVerificable,
      descripcion: d.descripcion,
      observacion: d.observacion,
    });
  }

  /**
   * La caducidad que rige hoy es la actual (pendiente) o la nueva (cerrada), y solo
   * cuenta si no hay una renovación posterior: así se filtra la vigencia en la base.
   */
  private venceEntre(desde?: Date, hasta?: Date): Prisma.RenovacionWhereInput {
    const rango = { gte: desde, lte: hasta };
    return {
      OR: [
        { estado: { in: PENDIENTES }, sinCaducidadActual: false, fechaCaducidadActual: { not: null, ...rango } },
        { estado: 'CERRADO', nuevaSinCaducidad: false, nuevaFechaCaducidad: { not: null, ...rango } },
      ],
    };
  }

  private filtroVigencia(v: (typeof VIGENCIAS)[number]): Prisma.RenovacionWhereInput {
    if (v === 'SUSTITUIDA') return { siguientes: { some: { anuladoEn: null } } };
    if (v === 'SIN_CADUCIDAD') {
      return { AND: [NO_SUSTITUIDA, { OR: [{ estado: { in: PENDIENTES }, sinCaducidadActual: true }, { estado: 'CERRADO', nuevaSinCaducidad: true }] }] };
    }
    const hoyDia = fechaDia(hoy());
    const limite = new Date(hoyDia.getTime() + diasAviso() * MS_DIA);
    const ayer = new Date(hoyDia.getTime() - MS_DIA);
    const manana = new Date(limite.getTime() + MS_DIA);
    const rango = v === 'CADUCADA' ? this.venceEntre(undefined, ayer) : v === 'PROXIMA' ? this.venceEntre(hoyDia, limite) : this.venceEntre(manana, undefined);
    return { AND: [NO_SUSTITUIDA, rango] };
  }
}

function aDto(r: RenovacionCompleta, ahora = new Date()): RenovacionDto {
  const sustituidaPor = r.siguientes[0]?.id ?? null;
  const datos = { ...r, sustituida: sustituidaPor !== null };
  const { vigencia: v, diasRestantes } = vigencia(datos, ahora);
  return {
    id: r.id,
    activoId: r.activoId,
    activo: activoBreve(r.activo),
    tipo: r.tipo,
    responsable: r.responsable,
    fechaPlanificada: r.fechaPlanificada,
    fechaCaducidadActual: r.fechaCaducidadActual,
    sinCaducidadActual: r.sinCaducidadActual,
    estado: r.estado,
    fechaRenovacion: r.fechaRenovacion,
    nuevaFechaCaducidad: r.nuevaFechaCaducidad,
    nuevaSinCaducidad: r.nuevaSinCaducidad,
    evidencia: r.evidencia,
    repositorioVerificable: r.repositorioVerificable,
    descripcion: r.descripcion,
    observacion: r.observacion,
    cerradaPor: r.cerradaPor,
    vigencia: v,
    venceEl: sustituidaPor === null ? venceEl(r) : null,
    diasRestantes,
    renovacionAnterior: r.anterior,
    sustituidaPor,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
    anuladoEn: r.anuladoEn,
    anuladoPor: r.anuladoPor,
    motivoAnulacion: r.motivoAnulacion,
  };
}
