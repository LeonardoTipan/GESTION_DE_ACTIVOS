import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BitacoraIndicadorDto } from '../common/bitacora/dto.js';
import { bitacoraEndpoints } from './bitacora.js';
import type { CambioCampo } from '../audit/trazas.service.js';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import type { EventoAgendaDto, QueryAgendaDto } from '../common/dto/agenda.dto.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../common/dto/registro.dto.js';
import { diaLocal } from '../common/plazos/plazos.js';
import type { PeriodoEndpoint, Prisma } from '../generated/prisma/client.js';
import type { EstadoPeriodoEndpoint } from '../generated/prisma/enums.js';
import { filtroAplica } from '../inventory/activos/aplicacion.js';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AbrirPeriodoDto,
  ComparacionInventarioDto,
  DatosRegistroPeriodoDto,
  EquipoPeriodoDetalleDto,
  PeriodoEndpointDto,
  QueryPeriodosDto,
  ReabrirPeriodoDto,
} from './dto.js';
import {
  cobertura,
  equiposSinAntivirus,
  exigirCierre,
  exigirCoherencia,
  finDelMes,
  inicioDelMes,
  interpretarBusqueda,
  porEjecutar,
  semestreDelMes,
  wherePorEjecutar,
  type DatosRegistroPeriodo,
} from './reglas.js';

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PENDIENTES: EstadoPeriodoEndpoint[] = ['ABIERTO', 'EN_PROGRESO'];
const ETIQUETA_ESTADO: Record<EstadoPeriodoEndpoint, string> = { ABIERTO: 'Abierto', EN_PROGRESO: 'En progreso', CERRADO: 'Cerrado' };
/** Detalle mínimo para calcular los totales y saber si quedan equipos por registrar. */
const INCLUDE_DETALLE = { equipos: { select: { conAntivirus: true } } } as const;
type PeriodoConDetalle = PeriodoEndpoint & { equipos: { conAntivirus: boolean | null }[] };

const definidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const textoAntivirus = (v: boolean | null) => (v === null ? null : v ? 'Con antivirus' : 'Sin antivirus');

const aDto = ({ equipos, ...p }: PeriodoConDetalle, ahora = new Date()): PeriodoEndpointDto => ({
  ...p,
  semestre: semestreDelMes(p.anio, p.mes),
  conDetalle: equipos.length > 0,
  equiposSinRegistrar: equipos.length > 0 ? equipos.filter((e) => e.conAntivirus === null).length : null,
  porEjecutar: porEjecutar(p, ahora),
  cobertura: cobertura(p.totalActivos, p.equiposConAntivirus),
  equiposSinAntivirus: equiposSinAntivirus(p.totalActivos, p.equiposConAntivirus),
});

/**
 * Protección de Endpoints: un control MENSUAL de la cobertura de antivirus/EDR (único por año y
 * mes), con el DETALLE por equipo: los activos reales del inventario de categorías con
 * Endpoints, copiados al abrir el período. Con detalle, el total y los equipos con antivirus se
 * CALCULAN de él; los períodos anteriores al detalle conservan sus totales escritos a mano.
 * Fase 1: apertura con la fecha planificada (año y mes se derivan de ella). Fase 2: registro
 * (guardar avance → EN_PROGRESO) y cierre (→ CERRADO); reabrir solo admin, con motivo. Cada
 * cambio, también el de cada equipo, pasa por la auditoría común en la misma transacción.
 */
@Injectable()
export class PeriodosEndpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
    private readonly activos: ActivosService,
  ) {}

  /** Pendientes del tablero: períodos ABIERTO o EN_PROGRESO, no anulados (un registro por mes). */
  contarPendientes(): Promise<number> {
    return this.prisma.periodoEndpoint.count({ where: { estado: { in: PENDIENTES }, anuladoEn: null } });
  }

  /** Abiertos cuya fecha planificada (o, sin ella, su mes) ya pasó. */
  contarPorEjecutar(ahora = new Date()): Promise<number> {
    return this.prisma.periodoEndpoint.count({ where: { anuladoEn: null, ...wherePorEjecutar(ahora) } });
  }

  async findAll(q: QueryPeriodosDto): Promise<Paginated<PeriodoEndpointDto>> {
    const filtros: Prisma.PeriodoEndpointWhereInput[] = [{ anio: q.anio, mes: q.mes, estado: q.estado }];
    if (!q.incluirAnulados) filtros.push({ anuladoEn: null });
    if (q.pendientes) filtros.push({ estado: { in: PENDIENTES } });
    if (q.responsable) filtros.push({ OR: [{ responsable: { contains: q.responsable } }, { responsableEjecucion: { contains: q.responsable } }] });
    if (q.q) {
      const busqueda = interpretarBusqueda(q.q);
      filtros.push(busqueda ? { anio: busqueda.anio, mes: busqueda.meses && { in: busqueda.meses } } : { id: { in: [] } });
    }
    if (q.activo) filtros.push({ equipos: { some: { activo: { OR: [{ codigo: { contains: q.activo } }, { nombre: { contains: q.activo } }] } } } });
    if (q.categoriaId) filtros.push({ equipos: { some: { activo: { categoriaId: q.categoriaId } } } });
    const where: Prisma.PeriodoEndpointWhereInput = { AND: filtros };
    const ahora = new Date();
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.periodoEndpoint.count({ where }),
      this.prisma.periodoEndpoint.findMany({ where, include: INCLUDE_DETALLE, orderBy: [{ anio: 'desc' }, { mes: 'desc' }], skip: skipFor(q), take: q.limit }),
    ]);
    return paginate(
      filas.map((f) => aDto(f, ahora)),
      total,
      q,
    );
  }

  async findOne(id: number): Promise<PeriodoEndpointDto> {
    const p = await this.prisma.periodoEndpoint.findUnique({ where: { id }, include: INCLUDE_DETALLE });
    if (!p) throw new NotFoundException(`El período ${id} no existe.`);
    return aDto(p);
  }

  /** Los equipos del período (activos reales), ordenados por código. */
  async equipos(id: number): Promise<EquipoPeriodoDetalleDto[]> {
    await this.findOne(id);
    const lineas = await this.prisma.periodoEndpointActivo.findMany({
      where: { periodoId: id },
      include: { activo: SELECT_ACTIVO },
      orderBy: { activo: { codigo: 'asc' } },
    });
    return lineas.map((l) => ({ activoId: l.activoId, conAntivirus: l.conAntivirus, activo: activoBreve(l.activo) }));
  }

  /**
   * La lista del período frente a los equipos elegibles de hoy: qué entró al inventario después
   * de abrirlo y qué dejó de ser elegible. Solo informa; el período conserva su lista.
   */
  async comparacion(id: number): Promise<ComparacionInventarioDto> {
    await this.findOne(id);
    const [lineas, hoy] = await Promise.all([
      this.prisma.periodoEndpointActivo.findMany({ where: { periodoId: id }, include: { activo: SELECT_ACTIVO }, orderBy: { activo: { codigo: 'asc' } } }),
      this.prisma.activo.findMany({ where: { AND: [this.activos.filtroOperativo(), filtroAplica('ENDPOINT')] }, ...SELECT_ACTIVO, orderBy: { codigo: 'asc' } }),
    ]);
    const enPeriodo = new Set(lineas.map((l) => l.activoId));
    const elegibles = new Set(hoy.map((a) => a.id));
    return {
      equiposPeriodo: lineas.length,
      elegiblesHoy: hoy.length,
      nuevos: hoy.filter((a) => !enPeriodo.has(a.id)).map(activoBreve),
      yaNoElegibles: lineas.filter((l) => !elegibles.has(l.activoId)).map((l) => activoBreve(l.activo)),
    };
  }

  /**
   * Abre el período (ABIERTO) a partir de la fecha PLANIFICADA: año y mes se derivan de ella en la
   * hora de la institución. Solo el mes en curso o uno anterior, y uno solo por mes. Copia los
   * equipos sujetos a control (activos operativos de categorías con Endpoints).
   */
  async abrir(dto: AbrirPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const [anio, mes] = diaLocal(dto.fechaPlanificada).split('-').map(Number);
    const [anioHoy, mesHoy] = diaLocal(new Date()).split('-').map(Number);
    if (anio * 12 + mes > anioHoy * 12 + mesHoy) {
      throw new BadRequestException('No se puede abrir un período futuro: la fecha planificada debe ser del mes en curso o de uno anterior.');
    }
    await this.exigirMesLibre(anio, mes);
    // Si dos peticiones abren el mismo mes a la vez, el índice único rechaza la segunda (P2002 → 409).
    const creado = await this.prisma.$transaction(async (tx) => {
      const p = await tx.periodoEndpoint.create({
        data: { anio, mes, fechaPlanificada: dto.fechaPlanificada, responsable: dto.responsable, observacion: dto.observacion || null },
      });
      const equipos = await this.elegibles(tx);
      if (equipos.length) await tx.periodoEndpointActivo.createMany({ data: equipos.map((a) => ({ periodoId: p.id, activoId: a.id })) });
      await this.trazas.registrarAlta(
        tx,
        'PERIODO_ENDPOINT',
        p.id,
        { anio, mes, fechaPlanificada: p.fechaPlanificada, responsable: p.responsable, observacion: p.observacion, estado: p.estado, equipos: equipos.length },
        'Apertura del período.',
        usuario.username,
      );
      return p.id;
    });
    return this.findOne(creado);
  }

  /**
   * Períodos pendientes abiertos antes del detalle por equipo: copia los equipos sujetos a control
   * de HOY. Solo una vez (si ya tiene detalle, 409) y nunca en un período cerrado.
   */
  async cargarEquipos(id: number, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, PENDIENTES, actual.estado);
    if (actual.conDetalle) throw new ConflictException(`El período ${id} ya tiene sus equipos.`);
    const equipos = await this.elegibles(this.prisma);
    if (!equipos.length) {
      throw new BadRequestException('No hay equipos operativos de categorías habilitadas para Protección de endpoints (Catálogos > Categorías).');
    }
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      {},
      'Equipos sujetos a control cargados desde el inventario.',
      usuario.username,
      { estado: { in: PENDIENTES } },
      (tx) => tx.periodoEndpointActivo.createMany({ data: equipos.map((a) => ({ periodoId: id, activoId: a.id })) }),
      [{ campo: 'equipos', antes: 0, despues: equipos.length }],
    );
    return this.findOne(id);
  }

  // ── Fase 2 · Registro y cierre ────────────────────────────────────────────

  /**
   * Guardar avance: escribe los datos enviados y deja el período EN_PROGRESO (no lo cierra).
   * Un período CERRADO no se edita: primero se reabre (solo admin, con motivo).
   */
  async registrar(id: number, dto: DatosRegistroPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    if (actual.estado === 'CERRADO') {
      throw new ConflictException(`El período ${id} está CERRADO: un administrador debe reabrirlo para corregirlo.`);
    }
    const detalle = await this.prepararDetalle(id, dto);
    const resultado = this.combinar(actual, dto, detalle.totales);
    exigirCoherencia(resultado, actual);
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { ...this.cambios(dto), ...detalle.totales, estado: 'EN_PROGRESO' },
      'Avance del registro del período guardado.',
      usuario.username,
      { estado: { in: PENDIENTES } },
      detalle.escribir,
      detalle.cambios,
    );
    return this.findOne(id);
  }

  /**
   * → CERRADO. Exige los dos totales (con detalle: todos los equipos registrados), la fecha real y
   * el responsable de la medición, el verificable y su repositorio (lo guardado más lo enviado).
   */
  async cerrar(id: number, dto: DatosRegistroPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, PENDIENTES, 'CERRADO');
    const detalle = await this.prepararDetalle(id, dto);
    if (detalle.sinRegistrar.length) {
      const muestra = detalle.sinRegistrar.slice(0, 10).join(', ');
      throw new BadRequestException(
        `Para cerrar el período falta registrar el antivirus de ${detalle.sinRegistrar.length} equipo(s): ${muestra}${detalle.sinRegistrar.length > 10 ? '…' : ''}.`,
      );
    }
    exigirCierre(this.combinar(actual, dto, detalle.totales), actual);
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { ...this.cambios(dto), ...detalle.totales, estado: 'CERRADO', cerradoPor: usuario.username },
      'Período registrado y cerrado.',
      usuario.username,
      { estado: { in: PENDIENTES } },
      detalle.escribir,
      detalle.cambios,
    );
    return this.findOne(id);
  }

  /** CERRADO → EN_PROGRESO (solo admin, con motivo). Los datos se conservan para corregirlos. */
  async reabrir(id: number, dto: ReabrirPeriodoDto, usuario: AuthUser): Promise<PeriodoEndpointDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, ['CERRADO'], 'EN_PROGRESO');
    await this.trazas.modificar(
      'PERIODO_ENDPOINT',
      id,
      { estado: 'EN_PROGRESO', cerradoPor: null },
      `Reabierto: ${dto.motivo}`.slice(0, 5000),
      usuario.username,
      { estado: 'CERRADO' },
    );
    return this.findOne(id);
  }

  // ── Agenda (calendario general) ───────────────────────────────────────────

  /** Bitácora General mensual del año (criterio en bitacora.ts): periodos no anulados con sus líneas. */
  async bitacoraGeneral(anio: number): Promise<BitacoraIndicadorDto> {
    const periodos = await this.prisma.periodoEndpoint.findMany({
      where: { anio, anuladoEn: null },
      select: { mes: true, estado: true, totalActivos: true, equiposConAntivirus: true, equipos: { select: { conAntivirus: true } } },
    });
    return bitacoraEndpoints(anio, periodos.map(({ equipos, ...p }) => ({ ...p, lineas: equipos })));
  }

  /**
   * Eventos del calendario: capa 1 · la fecha PLANIFICADA del período (sin ella, períodos
   * anteriores, el mes completo); capa 2 · la medición real. Estados: abierto → programado (o
   * «por ejecutar» si la fecha pasó), en progreso → en curso, cerrado → completado. Un período no
   * es de un activo: el detalle dice cuántos equipos y de qué categorías.
   */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const ahora = new Date();
    const filas = await this.prisma.periodoEndpoint.findMany({
      where: {
        anuladoEn: null,
        ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
        ...(q.categoriaId ? { equipos: { some: { activo: { categoriaId: q.categoriaId } } } } : {}),
      },
      include: { equipos: { select: { conAntivirus: true, activo: { select: { categoria: { select: { nombre: true } } } } } } },
      orderBy: [{ anio: 'asc' }, { mes: 'asc' }],
    });
    const eventos: EventoAgendaDto[] = [];
    const quiere = (c: number) => !q.capa || q.capa === c;
    for (const p of filas) {
      const inicio = p.fechaPlanificada ?? inicioDelMes(p);
      const fin = p.fechaPlanificada ? null : finDelMes(p);
      const base = { modulo: 'endpoints' as const, activo: null, fueraDePlazo: false, ruta: `/proteccion-endpoints/${p.id}` };
      const nombre = `${NOMBRE_MES[p.mes - 1]} de ${p.anio}`;
      const categorias = [...new Set(p.equipos.map((e) => e.activo.categoria.nombre))].sort().join(', ');
      const equipos = p.equipos.length ? `${p.equipos.length} equipo(s)${categorias ? ` (${categorias})` : ''}` : 'Sin detalle por equipo';
      if (quiere(1) && inicio <= q.hasta && (fin ?? inicio) >= q.desde) {
        const estado = p.estado === 'CERRADO' ? 'COMPLETADO' : p.estado === 'EN_PROGRESO' ? 'EN_CURSO' : porEjecutar(p, ahora) ? 'POR_EJECUTAR' : 'PROGRAMADO';
        eventos.push({
          ...base,
          clave: `ep1-${p.id}`,
          capa: 1,
          tipo: 'PREVISTO',
          titulo: `Protección de Endpoints · ${nombre}`,
          inicio,
          fin,
          estado,
          responsable: p.responsable,
          detalle: `${equipos} · Estado: ${porEjecutar(p, ahora) ? 'Por ejecutar' : ETIQUETA_ESTADO[p.estado]}`,
        });
      }
      if (quiere(2) && p.fechaEjecucion && p.fechaEjecucion >= q.desde && p.fechaEjecucion <= q.hasta) {
        const cob = cobertura(p.totalActivos, p.equiposConAntivirus);
        eventos.push({ ...base, clave: `ep2-${p.id}`, capa: 2, tipo: 'REAL', titulo: `Medición de antivirus · ${nombre}`, inicio: p.fechaEjecucion, fin: null, estado: p.estado === 'CERRADO' ? 'COMPLETADO' : 'EN_CURSO', responsable: p.responsableEjecucion, detalle: cob === null ? equipos : `${equipos} · cobertura ${cob} %` });
      }
    }
    return (q.estado ? eventos.filter((e) => e.estado === q.estado) : eventos).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  /** Equipos sujetos a control HOY: activos operativos de categorías con Endpoints. */
  private elegibles(cliente: Prisma.TransactionClient | PrismaService) {
    return cliente.activo.findMany({ where: { AND: [this.activos.filtroOperativo(), filtroAplica('ENDPOINT')] }, select: { id: true }, orderBy: { codigo: 'asc' } });
  }

  private async exigirMesLibre(anio: number, mes: number): Promise<void> {
    const existente = await this.prisma.periodoEndpoint.findUnique({ where: { anio_mes: { anio, mes } } });
    if (existente) {
      throw new ConflictException(`El período de ${NOMBRE_MES[mes - 1]} de ${anio} ya existe (n.º ${existente.id}).`);
    }
  }

  /**
   * Con detalle por equipo: aplica lo enviado sobre lo guardado, calcula los totales (no se
   * aceptan escritos a mano), prepara la escritura de las líneas y su traza (una por equipo que
   * cambia). Sin detalle (períodos anteriores): los totales siguen siendo los escritos a mano.
   */
  private async prepararDetalle(id: number, dto: DatosRegistroPeriodoDto) {
    const lineas = await this.prisma.periodoEndpointActivo.findMany({ where: { periodoId: id }, include: { activo: { select: { codigo: true } } } });
    const vacio = { totales: {} as Partial<Record<'totalActivos' | 'equiposConAntivirus', number>>, cambios: [] as CambioCampo[], escribir: undefined, sinRegistrar: [] as string[] };
    if (!lineas.length) {
      if (dto.equipos?.length) throw new BadRequestException('Este período no tiene detalle por equipo: cárguelo antes de registrar cada equipo.');
      return vacio;
    }
    if (dto.totalActivos !== undefined || dto.equiposConAntivirus !== undefined) {
      throw new BadRequestException('El total de activos y los equipos con antivirus se calculan del detalle por equipo: no se escriben a mano.');
    }
    const porActivo = new Map(lineas.map((l) => [l.activoId, l]));
    const nuevo = new Map(lineas.map((l) => [l.activoId, l.conAntivirus]));
    for (const e of dto.equipos ?? []) {
      if (!porActivo.has(e.activoId)) throw new BadRequestException(`El activo ${e.activoId} no está entre los equipos del período.`);
      nuevo.set(e.activoId, e.conAntivirus);
    }
    const cambiadas = lineas.filter((l) => nuevo.get(l.activoId) !== l.conAntivirus);
    const valores = [...nuevo.values()];
    return {
      totales: { totalActivos: lineas.length, equiposConAntivirus: valores.filter((v) => v === true).length },
      cambios: cambiadas.map((l) => ({ campo: `Equipo ${l.activo.codigo}`, antes: textoAntivirus(l.conAntivirus), despues: textoAntivirus(nuevo.get(l.activoId) ?? null) })),
      escribir: cambiadas.length
        ? async (tx: Prisma.TransactionClient) => {
            for (const l of cambiadas) await tx.periodoEndpointActivo.update({ where: { id: l.id }, data: { conAntivirus: nuevo.get(l.activoId) ?? null } });
          }
        : undefined,
      sinRegistrar: lineas.filter((l) => nuevo.get(l.activoId) === null).map((l) => l.activo.codigo).sort(),
    };
  }

  private async exigirVigente(id: number): Promise<PeriodoEndpointDto> {
    const p = await this.findOne(id);
    if (p.anuladoEn) throw new ConflictException(`El período ${id} está anulado: revierta la anulación antes de modificarlo.`);
    return p;
  }

  private exigirEstado(actual: PeriodoEndpointDto, desde: EstadoPeriodoEndpoint[], hacia: EstadoPeriodoEndpoint): void {
    if (!desde.includes(actual.estado)) {
      throw new ConflictException(`El período ${actual.id} está ${actual.estado}: no puede pasar a ${hacia}.`);
    }
  }

  /** Lo guardado más lo enviado (y los totales calculados del detalle): así se valida el resultado. */
  private combinar(actual: PeriodoEndpointDto, d: DatosRegistroPeriodoDto, totales: Partial<Record<'totalActivos' | 'equiposConAntivirus', number>>): DatosRegistroPeriodo {
    return {
      totalActivos: totales.totalActivos ?? d.totalActivos ?? actual.totalActivos,
      equiposConAntivirus: totales.equiposConAntivirus ?? d.equiposConAntivirus ?? actual.equiposConAntivirus,
      fechaEjecucion: d.fechaEjecucion ?? actual.fechaEjecucion,
      responsableEjecucion: d.responsableEjecucion ?? actual.responsableEjecucion,
      evidencia: d.evidencia ?? actual.evidencia,
      repositorioVerificable: d.repositorioVerificable ?? actual.repositorioVerificable,
    };
  }

  private cambios(d: DatosRegistroPeriodoDto): Record<string, unknown> {
    return definidos({
      totalActivos: d.totalActivos,
      equiposConAntivirus: d.equiposConAntivirus,
      fechaEjecucion: d.fechaEjecucion,
      responsableEjecucion: d.responsableEjecucion,
      evidencia: d.evidencia,
      repositorioVerificable: d.repositorioVerificable,
      observacion: d.observacion,
    });
  }
}
