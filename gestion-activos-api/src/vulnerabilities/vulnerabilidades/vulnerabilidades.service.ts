import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvisosService } from '../../audit/avisos.service.js';
import { MOTIVO_MINIMO } from '../../audit/dto/traza.dto.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { EventoAgendaDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import { paginate, skipFor, type Paginated } from '../../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../../common/dto/registro.dto.js';
import { exigirRepositorioValido } from '../../common/evidencia/repositorio.js';
import type { IndicadorDto } from '../../common/indicadores/indicador.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { agendaVulnerabilidades } from './agenda.js';
import type {
  ActualizarRemediacionDto,
  EditarVulnerabilidadDto,
  IniciarRemediacionDto,
  ReabrirDto,
  RegistrarLoteDto,
  RegistrarVulnerabilidadDto,
  RemediarDto,
} from './dto/acciones.dto.js';
import type { QueryVulnerabilidadesDto } from './dto/query-vulnerabilidades.dto.js';
import type { VulnerabilidadDto } from './dto/vulnerabilidad.dto.js';
import { indicadoresVulnerabilidad } from './indicadores.js';
import { exigirCierre, exigirFechaRemediacion, exigirInicio } from './reglas.js';
import {
  ESTADOS_ABIERTOS,
  estaVencida,
  puedeTransicionar,
  TRANSICIONES,
  type AccionVulnerabilidad,
} from './transiciones.js';

const INCLUDE = { activo: SELECT_ACTIVO } as const;

/**
 * Solo registros cuyo activo existe. Las claves foráneas lo garantizan, pero si
 * alguien vacía la tabla de activos saltándoselas, un registro huérfano haría
 * fallar la consulta entera (el activo es obligatorio): se ignora en vez de
 * tumbar el módulo. La sincronización con GLPI los detecta y los denuncia.
 */
const CON_ACTIVO = { activo: { id: { gt: 0 } } } as const;

type VulnerabilidadConActivo = Prisma.VulnerabilidadGetPayload<{ include: typeof INCLUDE }>;

/** Quita las claves sin valor: lo no enviado no cambia. */
const definidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Vulnerabilidades en DOS fases sobre el mismo registro:
 *   Detección: se registra ABIERTO (fecha de detección, sistema, descripción,
 *     criticidad, responsable).
 *   Remediación: EN_PROGRESO → REMEDIADO con la fecha REAL de remediación, el
 *     verificable y su repositorio; se puede reabrir.
 * El estado de la vulnerabilidad nunca modifica el activo. Todo cambio pasa por la
 * auditoría común (registro_cambio) en la misma transacción, con el usuario de la sesión.
 */
@Injectable()
export class VulnerabilidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
    private readonly avisos: AvisosService,
  ) {}

  /** Pendientes para el tablero: ABIERTO y EN_PROGRESO, no anuladas y con activo. */
  contarPendientes(): Promise<number> {
    return this.prisma.vulnerabilidad.count({
      where: { estado: { in: ESTADOS_ABIERTOS }, anuladoEn: null, ...CON_ACTIVO },
    });
  }

  async findAll(query: QueryVulnerabilidadesDto): Promise<Paginated<VulnerabilidadDto>> {
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
        ...(query.categoriaId ? { activo: { categoriaId: query.categoriaId } } : {}),
        ...(query.responsable ? { responsable: { contains: query.responsable } } : {}),
      },
    ];
    if (query.desde || query.hasta) filtros.push({ fecha: { gte: query.desde, lte: query.hasta } });
    if (query.q) {
      filtros.push({
        OR: [
          { descripcion: { contains: query.q } },
          { cve: { contains: query.q } },
          { activo: { codigo: { contains: query.q } } },
          { activo: { nombre: { contains: query.q } } },
        ],
      });
    }
    if (query.cve) filtros.push({ cve: { contains: query.cve } });
    if (query.abiertas === true) filtros.push({ estado: { in: ESTADOS_ABIERTOS } });
    if (query.abiertas === false) filtros.push({ estado: { notIn: ESTADOS_ABIERTOS } });
    if (query.vencidas === true) filtros.push(vencidas);
    if (query.vencidas === false) filtros.push({ NOT: vencidas });
    if (query.actualizadoDesde) filtros.push({ updatedAt: { gt: query.actualizadoDesde } });
    if (!query.incluirAnulados) filtros.push({ anuladoEn: null });
    const where: Prisma.VulnerabilidadWhereInput = { AND: [...filtros, CON_ACTIVO] };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.vulnerabilidad.count({ where }),
      this.prisma.vulnerabilidad.findMany({
        where,
        include: INCLUDE,
        // Lo más urgente primero: mayor criticidad y, dentro del nivel, la más antigua.
        orderBy: [{ nivelRiesgo: 'desc' }, { fecha: 'asc' }, { id: 'asc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map((v) => aDto(v, ahora)), total, query);
  }

  async findOne(id: number): Promise<VulnerabilidadDto> {
    const v = await this.prisma.vulnerabilidad.findFirst({ where: { id, ...CON_ACTIVO }, include: INCLUDE });
    if (!v) throw new NotFoundException(`La vulnerabilidad ${id} no existe.`);
    return aDto(v);
  }

  // ── Fase 1 · Detección ────────────────────────────────────────────────────

  /**
   * Registra la vulnerabilidad en estado ABIERTO, con la traza del alta (quién la
   * registró y con qué datos) en la misma transacción. El activo debe estar operativo.
   */
  async registrar(dto: RegistrarVulnerabilidadDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    await this.validarRegistro(dto);
    return this.prisma.$transaction(async (tx) => {
      const { activoId, fecha, descripcion, nivelRiesgo, responsable, cve, fechaLimite } = dto;
      const v = await tx.vulnerabilidad.create({
        data: { activoId, fecha, descripcion, nivelRiesgo, responsable, cve, fechaLimite, estado: 'ABIERTO' },
        include: INCLUDE,
      });
      await this.trazas.registrarAlta(
        tx,
        'VULNERABILIDAD',
        v.id,
        { activoId: v.activoId, fecha: v.fecha, descripcion: v.descripcion, nivelRiesgo: v.nivelRiesgo, responsable: v.responsable, cve: v.cve, fechaLimite: v.fechaLimite, estado: v.estado },
        'Vulnerabilidad detectada (fase de Detección).',
        usuario.username,
      );
      if (v.nivelRiesgo === 'CRITICO') await this.avisoCritica(tx, v, usuario);
      return aDto(v);
    });
  }

  /** La misma vulnerabilidad en varios activos: se valida todo antes de crear nada. */
  async registrarLote(dto: RegistrarLoteDto, usuario: AuthUser): Promise<VulnerabilidadDto[]> {
    const { activoIds, ...datos } = dto;
    for (const activoId of activoIds) await this.validarRegistro({ ...datos, activoId });
    const creadas: VulnerabilidadDto[] = [];
    for (const activoId of activoIds) creadas.push(await this.registrar({ ...datos, activoId }, usuario));
    return creadas;
  }

  /** Reglas del registro, sin escribir nada. */
  private async validarRegistro(dto: RegistrarVulnerabilidadDto): Promise<void> {
    // Validado aquí, en el backend: la interfaz solo ofrece equipos operativos.
    await this.activos.exigirOperativo(dto.activoId);
    if (dto.fechaLimite && dto.fechaLimite < dto.fecha) {
      throw new BadRequestException('La fecha límite no puede ser anterior a la fecha de detección.');
    }
    if (dto.cve) await this.exigirCveNoPendiente(dto.activoId, dto.cve);
  }

  private async exigirCveNoPendiente(activoId: number, cve: string, salvo?: number): Promise<void> {
    const pendiente = await this.prisma.vulnerabilidad.findFirst({
      where: { activoId, cve, estado: { in: ESTADOS_ABIERTOS }, anuladoEn: null, ...(salvo ? { id: { not: salvo } } : {}) },
      select: { id: true },
    });
    if (pendiente) throw new ConflictException(`El activo ya tiene ${cve} pendiente (vulnerabilidad ${pendiente.id}).`);
  }

  /**
   * Corrige los datos de Detección (criticidad, responsable, descripción, fechas,
   * CVE) con motivo, mientras está pendiente. Queda en la auditoría.
   */
  async update(id: number, dto: EditarVulnerabilidadDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.exigirVigente(id);
    if (!ESTADOS_ABIERTOS.includes(actual.estado)) {
      throw new ConflictException(`La vulnerabilidad ${id} está ${actual.estado}: reábrala para corregir su detección.`);
    }
    const fecha = datos.fecha ?? actual.fecha;
    const fechaLimite = datos.fechaLimite ?? actual.fechaLimite;
    if (fechaLimite && fechaLimite < fecha) {
      throw new BadRequestException('La fecha límite no puede ser anterior a la fecha de detección.');
    }
    exigirFechaRemediacion(fecha, actual.fechaRemediacion);
    if (datos.cve && datos.cve !== actual.cve) await this.exigirCveNoPendiente(actual.activoId, datos.cve, id);
    const pasaACritica = datos.nivelRiesgo === 'CRITICO' && actual.nivelRiesgo !== 'CRITICO';
    await this.trazas.modificar('VULNERABILIDAD', id, definidos(datos), motivoCambio, usuario.username, { estado: { in: ESTADOS_ABIERTOS } }, async (tx) => {
      if (pasaACritica) await this.avisoCritica(tx, actual, usuario);
    });
    return this.findOne(id);
  }

  // ── Fase 2 · Remediación ──────────────────────────────────────────────────

  /** ABIERTO → EN_PROGRESO, opcionalmente con el inicio real del trabajo. */
  async iniciar(id: number, dto: IniciarRemediacionDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    const actual = await this.findOne(id);
    exigirInicio(actual.fecha, dto.fechaInicio);
    return this.transicionar(id, 'iniciar', definidos({ tratamientoIniciadoEn: dto.fechaInicio }), 'Remediación en progreso.', usuario);
  }

  /**
   * Guarda o corrige los datos de remediación SIN cambiar el estado: registrar una
   * fecha no la marca como remediada. Pendiente: admin y analista. Ya REMEDIADO:
   * solo admin, con motivo, y sin dejar de cumplir los requisitos de cierre.
   */
  async actualizarRemediacion(id: number, dto: ActualizarRemediacionDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.exigirVigente(id);
    const remediada = actual.estado === 'REMEDIADO';
    if (remediada && !usuario.roles.includes('admin')) {
      throw new ForbiddenException(`La vulnerabilidad ${id} está REMEDIADA: solo un administrador corrige su remediación.`);
    }
    if (remediada && (motivoCambio?.trim().length ?? 0) < MOTIVO_MINIMO) {
      throw new BadRequestException(`Para corregir una remediación cerrada indique el motivo (al menos ${MOTIVO_MINIMO} caracteres).`);
    }
    exigirFechaRemediacion(actual.fecha, datos.fechaRemediacion);
    exigirRepositorioValido(datos.repositorioVerificable);
    if (remediada) {
      exigirCierre(actual.fecha, {
        fechaRemediacion: datos.fechaRemediacion ?? actual.fechaRemediacion,
        evidencia: datos.evidencia ?? actual.evidencia,
        repositorioVerificable: datos.repositorioVerificable ?? actual.repositorioVerificable,
      });
    }
    await this.trazas.modificar(
      'VULNERABILIDAD',
      id,
      definidos(datos),
      remediada ? motivoCambio!.trim() : (motivoCambio?.trim() || 'Datos de remediación actualizados.'),
      usuario.username,
      { estado: actual.estado },
    );
    return this.findOne(id);
  }

  /**
   * → REMEDIADO. Exige la fecha REAL de remediación (manual: nunca la del servidor),
   * el verificable y su repositorio. Se guarda quién registró la remediación.
   */
  async remediar(id: number, dto: RemediarDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    const actual = await this.findOne(id);
    exigirCierre(actual.fecha, dto);
    return this.transicionar(
      id,
      'remediar',
      definidos({
        fechaRemediacion: dto.fechaRemediacion,
        evidencia: dto.evidencia,
        repositorioVerificable: dto.repositorioVerificable,
        observacion: dto.observacion,
        cerradaPor: usuario.username,
      }),
      `Remediada (fecha real ${dto.fechaRemediacion.toISOString().slice(0, 10)}). Verificable: ${dto.evidencia}.`.slice(0, 5000),
      usuario,
    );
  }

  /**
   * REMEDIADO → EN_PROGRESO con motivo. La fecha de remediación vigente se vacía
   * (la anterior queda en la auditoría, con quién y cuándo la registró); el
   * verificable, el repositorio y la observación se conservan como referencia.
   */
  async reabrir(id: number, dto: ReabrirDto, usuario: AuthUser): Promise<VulnerabilidadDto> {
    const actual = await this.findOne(id);
    return this.transicionar(
      id,
      'reabrir',
      { fechaRemediacion: null, cerradaPor: null },
      `Reabierta: ${dto.motivo}`.slice(0, 5000),
      usuario,
      (tx) =>
        this.avisos.avisar(
          {
            tipo: 'VULNERABILIDAD_REABIERTA',
            titulo: `Vulnerabilidad reabierta: ${actual.cve ?? `#${actual.id}`} en ${actual.activo.codigo}`,
            mensaje: `${dto.motivo} (reabierta por ${usuario.username}).`,
            activoId: actual.activoId,
          },
          tx,
        ),
    );
  }

  /**
   * Cambio de estado con la auditoría común: actualización condicional (si el
   * estado cambió entretanto, 409) y traza en la MISMA transacción.
   */
  private async transicionar(
    id: number,
    accion: AccionVulnerabilidad,
    data: Record<string, unknown>,
    motivo: string,
    usuario: AuthUser,
    ademas?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<VulnerabilidadDto> {
    const actual = await this.exigirVigente(id);
    if (!puedeTransicionar(actual.estado, accion)) {
      throw new ConflictException(`No se puede ${accion} la vulnerabilidad ${id}: está ${actual.estado}.`);
    }
    const { desde, hacia } = TRANSICIONES[accion];
    await this.trazas.modificar('VULNERABILIDAD', id, { ...data, estado: hacia }, motivo, usuario.username, { estado: { in: desde } }, ademas);
    return this.findOne(id);
  }

  private async exigirVigente(id: number): Promise<VulnerabilidadDto> {
    const v = await this.findOne(id);
    if (v.anuladoEn) throw new ConflictException(`La vulnerabilidad ${id} está anulada: reviértala antes de modificarla.`);
    return v;
  }

  private avisoCritica(
    tx: Prisma.TransactionClient,
    v: { id: number; cve: string | null; descripcion: string; activoId: number; activo: { codigo: string; nombre: string } },
    usuario: AuthUser,
  ) {
    return this.avisos.avisar(
      {
        tipo: 'VULNERABILIDAD_CRITICA',
        titulo: `Vulnerabilidad crítica en ${v.activo.codigo} · ${v.activo.nombre}`,
        mensaje: `${v.cve ?? `#${v.id}`}: ${v.descripcion.slice(0, 300)} (${usuario.username}).`,
        activoId: v.activoId,
      },
      tx,
    );
  }

  // ── Registro: anulación lógica ────────────────────────────────────────────

  async anular(id: number, motivo: string, usuario: AuthUser): Promise<VulnerabilidadDto> {
    await this.findOne(id);
    await this.trazas.anular('VULNERABILIDAD', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<VulnerabilidadDto> {
    await this.findOne(id);
    await this.trazas.reversar('VULNERABILIDAD', id, motivo, usuario.username);
    return this.findOne(id);
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  /** Indicadores: pendientes sobre el estado de hoy; cierre sobre las detectadas en el período. */
  async indicadores(desde: Date, hasta: Date): Promise<IndicadorDto[]> {
    const [actuales, delPeriodo] = await Promise.all([
      this.prisma.vulnerabilidad.findMany({ where: { anuladoEn: null, ...CON_ACTIVO } }),
      this.prisma.vulnerabilidad.findMany({ where: { anuladoEn: null, fecha: { gte: desde, lte: hasta }, ...CON_ACTIVO } }),
    ]);
    return indicadoresVulnerabilidad(actuales, delPeriodo, new Date());
  }

  /** Agenda (calendario) de las dos fases en un rango. */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const rango = { gte: q.desde, lte: q.hasta };
    const vulnerabilidades = await this.prisma.vulnerabilidad.findMany({
      where: {
        anuladoEn: null,
        ...(q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {}),
        ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
        OR: [
          { fecha: rango },
          { fechaLimite: rango },
          { tratamientoIniciadoEn: rango },
          { fechaRemediacion: rango },
          { estado: { in: ESTADOS_ABIERTOS }, fecha: { lte: q.hasta } },
        ],
      },
      include: INCLUDE,
      take: 2000,
    });
    const eventos = agendaVulnerabilidades({
      vulnerabilidades: vulnerabilidades.map((v) => ({ ...v, activo: activoBreve(v.activo) })),
      desde: q.desde,
      hasta: q.hasta,
      ahora: new Date(),
      capa: q.capa,
    });
    return q.estado ? eventos.filter((e) => e.estado === q.estado) : eventos;
  }
}

function aDto(v: VulnerabilidadConActivo, ahora = new Date()): VulnerabilidadDto {
  return {
    id: v.id,
    activoId: v.activoId,
    activo: activoBreve(v.activo),
    fecha: v.fecha,
    descripcion: v.descripcion,
    nivelRiesgo: v.nivelRiesgo,
    responsable: v.responsable,
    cve: v.cve,
    fechaLimite: v.fechaLimite,
    estado: v.estado,
    vencida: estaVencida(v, ahora),
    tratamientoIniciadoEn: v.tratamientoIniciadoEn,
    fechaRemediacion: v.fechaRemediacion,
    evidencia: v.evidencia,
    repositorioVerificable: v.repositorioVerificable,
    observacion: v.observacion,
    cerradaPor: v.cerradaPor,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    version: v.version,
    anuladoEn: v.anuladoEn,
    anuladoPor: v.anuladoPor,
    motivoAnulacion: v.motivoAnulacion,
  };
}
