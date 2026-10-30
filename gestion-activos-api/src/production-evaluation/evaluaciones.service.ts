import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TrazasService } from '../audit/trazas.service.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { paginate, skipFor, type Paginated } from '../common/dto/paginated-response.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../common/dto/registro.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { EstadoEvaluacionSistema } from '../generated/prisma/enums.js';
import { ActivosService } from '../inventory/activos/activos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bitacoraGeneral } from './bitacora.js';
import type { EventoAgendaDto, QueryAgendaDto } from '../common/dto/agenda.dto.js';

import type {
  BitacoraEvaluacionDto,
  DatosEjecucionEvaluacionDto,
  EvaluacionSistemaDto,
  PlanificarEvaluacionDto,
  QueryBitacoraEspecificaEvaluacionDto,
  QueryBitacoraEvaluacionDto,
  QueryEvaluacionesDto,
  ReabrirEvaluacionDto,
} from './dto.js';
import { esTardia, exigirCierre, exigirCoherencia, situacion, type DatosEjecucionEvaluacion, type Situacion } from './reglas.js';
import { rangoDe, semestreDe, type NumeroSemestre } from './semestres.js';

const PENDIENTES: EstadoEvaluacionSistema[] = ['ABIERTO', 'EN_PROGRESO'];
const INCLUDE = { activo: SELECT_ACTIVO } as const;
type EvaluacionConActivo = Prisma.EvaluacionSistemaGetPayload<{ include: typeof INCLUDE }>;

const definidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const aDto = (e: EvaluacionConActivo, ahora = new Date()): EvaluacionSistemaDto => ({
  ...e,
  activo: activoBreve(e.activo),
  vencida: PENDIENTES.includes(e.estado) && e.fechaProgramadaProduccion < ahora,
  tardia: esTardia(e.fechaPruebas, e.fechaProgramadaProduccion),
  situacion: situacion(e, ahora),
  semestrePlanificado: semestreDe(e.fechaProgramadaProduccion).etiqueta,
  semestreReal: e.fechaPruebas ? semestreDe(e.fechaPruebas).etiqueta : null,
});

/**
 * Evaluación de Sistemas Productivos: evaluación de seguridad de un sistema antes de su
 * paso a producción. La fecha programada de paso a producción no es la fecha de solicitud.
 * Fase 1: planificación (ABIERTO). Fase 2: ejecución (guardar avance → EN_PROGRESO) y cierre
 * (→ CERRADO) con la fecha REAL de las pruebas, el informe y su repositorio; reabrir solo
 * admin, con motivo. Alimenta la bitácora General y Específica por semestres.
 */
@Injectable()
export class EvaluacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  /**
   * Pendientes del tablero: ABIERTO o EN_PROGRESO, no anuladas. Las vencidas ya están
   * incluidas (son pendientes con la fecha programada pasada): no se suman aparte.
   */
  contarPendientes(): Promise<number> {
    return this.prisma.evaluacionSistema.count({ where: { estado: { in: PENDIENTES }, anuladoEn: null } });
  }

  async findAll(q: QueryEvaluacionesDto): Promise<Paginated<EvaluacionSistemaDto>> {
    const ahora = new Date();
    const filtros: Prisma.EvaluacionSistemaWhereInput[] = [{ activoId: q.activoId, estado: q.estado }];
    if (!q.incluirAnulados) filtros.push({ anuladoEn: null });
    if (q.responsable) filtros.push({ responsable: { contains: q.responsable } });
    if (q.pendientes === true) filtros.push({ estado: { in: PENDIENTES } });
    if (q.pendientes === false) filtros.push({ estado: 'CERRADO' });
    if (q.vencidas) filtros.push({ estado: { in: PENDIENTES }, fechaProgramadaProduccion: { lt: ahora } });
    if (q.desde || q.hasta) filtros.push({ fechaProgramadaProduccion: { gte: q.desde, lte: q.hasta } });
    if (q.q) {
      filtros.push({
        OR: [
          { activo: { codigo: { contains: q.q } } },
          { activo: { nombre: { contains: q.q } } },
          { descripcion: { contains: q.q } },
          { responsable: { contains: q.q } },
        ],
      });
    }
    return this.pagina({ AND: filtros }, q, ahora);
  }

  async findOne(id: number): Promise<EvaluacionSistemaDto> {
    const e = await this.prisma.evaluacionSistema.findUnique({ where: { id }, include: INCLUDE });
    if (!e) throw new NotFoundException(`La evaluación ${id} no existe.`);
    return aDto(e);
  }

  /**
   * Planifica la evaluación (ABIERTO). El sistema debe estar operativo y su categoría
   * habilitada para Evaluación; solo una evaluación pendiente por sistema.
   */
  async planificar(dto: PlanificarEvaluacionDto, usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    await this.activos.exigirOperativo(dto.activoId, 'EVALUACION');
    const pendiente = await this.prisma.evaluacionSistema.findFirst({
      where: { activoId: dto.activoId, estado: { in: PENDIENTES }, anuladoEn: null },
      select: { id: true },
    });
    if (pendiente) {
      throw new ConflictException(`El sistema ya tiene una evaluación pendiente (n.º ${pendiente.id}): ciérrela antes de planificar otra.`);
    }
    const creada = await this.prisma.$transaction(async (tx) => {
      const e = await tx.evaluacionSistema.create({
        data: {
          activoId: dto.activoId,
          fechaProgramadaProduccion: dto.fechaProgramadaProduccion,
          responsable: dto.responsable,
          descripcion: dto.descripcion,
        },
        include: INCLUDE,
      });
      await this.trazas.registrarAlta(
        tx,
        'EVALUACION_SISTEMA',
        e.id,
        { activoId: e.activoId, fechaProgramadaProduccion: e.fechaProgramadaProduccion, responsable: e.responsable, descripcion: e.descripcion, estado: e.estado },
        'Planificación de la evaluación.',
        usuario.username,
      );
      return e;
    });
    return aDto(creada);
  }

  // ── Fase 2 · Ejecución y cierre ───────────────────────────────────────────

  /**
   * Guardar avance: escribe lo enviado y deja la evaluación EN_PROGRESO (no la cierra).
   * Una evaluación CERRADA no se edita: primero se reabre (solo admin, con motivo).
   */
  async registrarEjecucion(id: number, dto: DatosEjecucionEvaluacionDto, usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    const actual = await this.exigirVigente(id);
    if (actual.estado === 'CERRADO') {
      throw new ConflictException(`La evaluación ${id} está CERRADA: un administrador debe reabrirla para corregirla.`);
    }
    exigirCoherencia(this.combinar(actual, dto));
    await this.trazas.modificar(
      'EVALUACION_SISTEMA',
      id,
      { ...this.cambios(dto), estado: 'EN_PROGRESO' },
      'Avance de la ejecución guardado.',
      usuario.username,
      { estado: { in: PENDIENTES } },
    );
    return this.findOne(id);
  }

  /** → CERRADO. Exige fecha real de las pruebas, informe y repositorio (y la justificación si fueron tardías). */
  async cerrar(id: number, dto: DatosEjecucionEvaluacionDto, usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, PENDIENTES, 'CERRADO');
    const resultado = this.combinar(actual, dto);
    exigirCierre(resultado);
    const tardia = esTardia(resultado.fechaPruebas, resultado.fechaProgramadaProduccion);
    await this.trazas.modificar(
      'EVALUACION_SISTEMA',
      id,
      { ...this.cambios(dto), estado: 'CERRADO', cerradoPor: usuario.username },
      tardia ? 'Evaluación ejecutada y cerrada (pruebas posteriores a la fecha programada, justificadas).' : 'Evaluación ejecutada y cerrada.',
      usuario.username,
      { estado: { in: PENDIENTES } },
    );
    return this.findOne(id);
  }

  /** CERRADO → EN_PROGRESO (solo admin, con motivo). Los datos se conservan para corregirlos. */
  async reabrir(id: number, dto: ReabrirEvaluacionDto, usuario: AuthUser): Promise<EvaluacionSistemaDto> {
    const actual = await this.exigirVigente(id);
    this.exigirEstado(actual, ['CERRADO'], 'EN_PROGRESO');
    await this.trazas.modificar(
      'EVALUACION_SISTEMA',
      id,
      { estado: 'EN_PROGRESO', cerradoPor: null },
      `Reabierta: ${dto.motivo}`.slice(0, 5000),
      usuario.username,
      { estado: 'CERRADO' },
    );
    return this.findOne(id);
  }

  // ── Bitácora ──────────────────────────────────────────────────────────────

  /**
   * Bitácora General por semestres: planificadas (semestre de la fecha programada), cumplidas a
   * tiempo y tarde, pendientes, vencidas, cerradas por semestre REAL y % de cumplimiento.
   */
  async bitacoraGeneral({ anio, semestre }: QueryBitacoraEvaluacionDto): Promise<BitacoraEvaluacionDto> {
    const semestres: NumeroSemestre[] = semestre ? [semestre] : [1, 2];
    const { desde, hasta } = rangoDe(anio, semestre);
    const evaluaciones = await this.prisma.evaluacionSistema.findMany({
      where: {
        anuladoEn: null,
        OR: [
          { fechaProgramadaProduccion: { gte: desde, lt: hasta } },
          { estado: 'CERRADO', fechaPruebas: { gte: desde, lt: hasta } },
        ],
      },
      select: { estado: true, fechaProgramadaProduccion: true, fechaPruebas: true },
    });
    return bitacoraGeneral(anio, semestres, evaluaciones);
  }

  /** Bitácora Específica: una fila por evaluación, filtrable por semestre planificado, sistema, asignado y situación. */
  async bitacoraEspecifica(q: QueryBitacoraEspecificaEvaluacionDto): Promise<Paginated<EvaluacionSistemaDto>> {
    if (q.semestre && !q.anio) throw new BadRequestException('El semestre exige el año.');
    const ahora = new Date();
    const filtros: Prisma.EvaluacionSistemaWhereInput[] = [{ anuladoEn: null, activoId: q.activoId }];
    if (q.anio) {
      const { desde, hasta } = rangoDe(q.anio, q.semestre);
      filtros.push({ fechaProgramadaProduccion: { gte: desde, lt: hasta } });
    }
    if (q.responsable) filtros.push({ responsable: { contains: q.responsable } });
    if (q.situacion) filtros.push(this.filtroSituacion(q.situacion, ahora));
    return this.pagina({ AND: filtros }, q, ahora);
  }

  // ── Agenda (calendario general) ───────────────────────────────────────────

  /**
   * Eventos del calendario: capa 1 · paso a producción PROGRAMADO (pendiente y pasado → vencido);
   * capa 2 · pruebas de seguridad REALES (fecha de las pruebas). Nunca la fecha de registro.
   */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const ahora = new Date();
    const enRango = { gte: q.desde, lte: q.hasta };
    const filas = await this.prisma.evaluacionSistema.findMany({
      where: {
        anuladoEn: null,
        ...(q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {}),
        ...(q.responsable ? { responsable: { contains: q.responsable } } : {}),
        OR: [{ fechaProgramadaProduccion: enRango }, { fechaPruebas: enRango }],
      },
      include: INCLUDE,
      take: 2000,
    });
    const eventos: EventoAgendaDto[] = [];
    const quiere = (c: number) => !q.capa || q.capa === c;
    for (const e of filas.map((f) => aDto(f, ahora))) {
      const base = { modulo: 'evaluaciones' as const, activo: e.activo, responsable: e.responsable, ruta: `/evaluacion-sistemas-productivos/${e.id}` };
      if (quiere(1) && e.fechaProgramadaProduccion >= q.desde && e.fechaProgramadaProduccion <= q.hasta) {
        const estado = e.estado === 'CERRADO' ? 'COMPLETADO' : e.vencida ? 'VENCIDO' : e.estado === 'EN_PROGRESO' ? 'EN_CURSO' : 'PROGRAMADO';
        eventos.push({ ...base, clave: `ev1-${e.id}`, capa: 1, tipo: 'PREVISTO', titulo: `Paso a producción · ${e.activo.codigo}`, inicio: e.fechaProgramadaProduccion, fin: null, estado, fueraDePlazo: false, detalle: `Evaluación #${e.id}` });
      }
      if (quiere(2) && e.fechaPruebas && e.fechaPruebas >= q.desde && e.fechaPruebas <= q.hasta) {
        eventos.push({ ...base, clave: `ev2-${e.id}`, capa: 2, tipo: 'REAL', titulo: `Pruebas de seguridad · ${e.activo.codigo}`, inicio: e.fechaPruebas, fin: null, estado: e.estado === 'CERRADO' ? 'COMPLETADO' : 'EN_CURSO', fueraDePlazo: e.tardia, detalle: e.tardia ? 'Posteriores a la fecha programada (justificadas)' : null });
      }
    }
    return (q.estado ? eventos.filter((x) => x.estado === q.estado) : eventos).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private async pagina(
    where: Prisma.EvaluacionSistemaWhereInput,
    q: { page: number; limit: number },
    ahora: Date,
  ): Promise<Paginated<EvaluacionSistemaDto>> {
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.evaluacionSistema.count({ where }),
      this.prisma.evaluacionSistema.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fechaProgramadaProduccion: 'asc' }, { id: 'asc' }],
        skip: skipFor(q),
        take: q.limit,
      }),
    ]);
    return paginate(filas.map((e) => aDto(e, ahora)), total, q);
  }

  /** La situación en la base: tardía = fecha de las pruebas posterior a la programada (comparación entre columnas). */
  private filtroSituacion(s: Situacion, ahora: Date): Prisma.EvaluacionSistemaWhereInput {
    const programada = this.prisma.evaluacionSistema.fields.fechaProgramadaProduccion;
    switch (s) {
      case 'PENDIENTE':
        return { estado: { in: PENDIENTES }, fechaProgramadaProduccion: { gte: ahora } };
      case 'VENCIDA':
        return { estado: { in: PENDIENTES }, fechaProgramadaProduccion: { lt: ahora } };
      case 'CUMPLIDA':
        return { estado: 'CERRADO', fechaPruebas: { lte: programada } };
      case 'CUMPLIDA_TARDE':
        return { estado: 'CERRADO', fechaPruebas: { gt: programada } };
    }
  }

  private async exigirVigente(id: number): Promise<EvaluacionSistemaDto> {
    const e = await this.findOne(id);
    if (e.anuladoEn) throw new ConflictException(`La evaluación ${id} está anulada: revierta la anulación antes de modificarla.`);
    return e;
  }

  private exigirEstado(actual: EvaluacionSistemaDto, desde: EstadoEvaluacionSistema[], hacia: EstadoEvaluacionSistema): void {
    if (!desde.includes(actual.estado)) {
      throw new ConflictException(`La evaluación ${actual.id} está ${actual.estado}: no puede pasar a ${hacia}.`);
    }
  }

  /** Lo guardado más lo enviado: así se valida el resultado, no solo lo que cambia. */
  private combinar(actual: EvaluacionSistemaDto, d: DatosEjecucionEvaluacionDto): DatosEjecucionEvaluacion {
    return {
      fechaProgramadaProduccion: actual.fechaProgramadaProduccion,
      fechaPruebas: d.fechaPruebas ?? actual.fechaPruebas,
      evidencia: d.evidencia ?? actual.evidencia,
      repositorioVerificable: d.repositorioVerificable ?? actual.repositorioVerificable,
      observacion: d.observacion ?? actual.observacion,
    };
  }

  private cambios(d: DatosEjecucionEvaluacionDto): Record<string, unknown> {
    return definidos({
      fechaPruebas: d.fechaPruebas,
      evidencia: d.evidencia,
      repositorioVerificable: d.repositorioVerificable,
      observacion: d.observacion,
    });
  }
}
