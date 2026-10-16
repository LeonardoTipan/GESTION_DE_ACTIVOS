import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvisosService } from '../../audit/avisos.service.js';
import type { EventoAgendaDto, ProgramarVerificacionDto, QueryAgendaDto } from '../../common/dto/agenda.dto.js';
import { activoBreve, SELECT_ACTIVO } from '../../common/dto/registro.dto.js';
import { agendaVulnerabilidades } from './agenda.js';
import { exigirIntervalo, exigirReprogramacion, plazoOExcepcion } from '../../common/plazos/plazos.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { VulnerabilidadDto } from '../vulnerabilidades/dto/vulnerabilidad.dto.js';
import { VulnerabilidadesService } from '../vulnerabilidades/vulnerabilidades.service.js';
import type {
  AccionRemediacionDto,
  AmpliarPlazoVulnerabilidadDto,
  EvaluarVulnerabilidadDto,
  RegistrarAccionDto,
  RegistrarLoteDto,
  RegistrarVerificacionVulnerabilidadDto,
  VerificacionVulnerabilidadDto,
} from './dto.js';

/**
 * Capas 1 a 3 del tratamiento de una vulnerabilidad, más allá del registro:
 *   1. Identificación → confirmación (alguien la comprueba).
 *   2. Evaluación (prioridad, responsable, plan) → acciones correctivas.
 *   3. Verificación: CORREGIDA la cierra; PERSISTE la mantiene o la reabre.
 * Nadie la marca como resuelta a mano: solo la cierra una verificación.
 */
@Injectable()
export class TratamientoVulnerabilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vulnerabilidades: VulnerabilidadesService,
    private readonly trazas: TrazasService,
    private readonly avisos: AvisosService,
  ) {}

  /** La misma vulnerabilidad en varios activos: un registro por activo, o ninguno. */
  async registrarLote(dto: RegistrarLoteDto, u: AuthUser): Promise<VulnerabilidadDto[]> {
    const { activoIds, ...datos } = dto;
    const creadas: VulnerabilidadDto[] = [];
    // Se valida todo antes de crear nada.
    for (const activoId of activoIds) await this.vulnerabilidades.validarRegistro({ ...datos, activoId });
    for (const activoId of activoIds) {
      creadas.push(await this.vulnerabilidades.registrar({ ...datos, activoId }, u));
    }
    return creadas;
  }

  async confirmar(id: number, u: AuthUser): Promise<VulnerabilidadDto> {
    const v = await this.vulnerabilidades.findOne(id);
    this.exigirVigente(v);
    if (v.estado !== 'ABIERTA') {
      throw new ConflictException(`Solo se confirma una vulnerabilidad ABIERTA (está ${v.estado}).`);
    }
    if (v.confirmadaEn) throw new ConflictException(`La vulnerabilidad ${id} ya está confirmada.`);
    await this.trazas.modificar(
      'VULNERABILIDAD',
      id,
      { confirmadaEn: new Date(), confirmadaPor: u.username },
      'Vulnerabilidad confirmada tras su comprobación.',
      u.username,
      { estado: 'ABIERTA', confirmadaEn: null },
    );
    return this.vulnerabilidades.findOne(id);
  }

  async evaluar(id: number, dto: EvaluarVulnerabilidadDto, u: AuthUser): Promise<VulnerabilidadDto> {
    const v = await this.vulnerabilidades.findOne(id);
    this.exigirVigente(v);
    if (!v.confirmadaEn) {
      throw new ConflictException('Confirme la vulnerabilidad antes de evaluarla.');
    }
    if (v.estado !== 'ABIERTA' && v.estado !== 'EN_MITIGACION') {
      throw new ConflictException(`No se evalúa una vulnerabilidad ${v.estado}.`);
    }
    if (dto.fechaLimite && dto.fechaLimite < v.fecha) {
      throw new BadRequestException('La fecha límite no puede ser anterior a la detección.');
    }
    // Ampliar un límite ya fijado es una decisión formal: PATCH /plazo (solo admin).
    if (dto.fechaLimite && v.fechaLimite && dto.fechaLimite > v.fechaLimite) {
      throw new ConflictException('Para ampliar el límite de remediación use «Ampliar plazo» (solo admin, con motivo).');
    }
    if (dto.tratamientoPrevisto && dto.tratamientoPrevisto < v.fecha) {
      throw new BadRequestException('El inicio previsto del tratamiento no puede ser anterior a la detección.');
    }
    exigirIntervalo(dto.tratamientoPrevisto, dto.fechaLimite ?? v.fechaLimite, 'Tratamiento');
    await this.trazas.modificar(
      'VULNERABILIDAD',
      id,
      { ...dto, evaluadaEn: new Date(), evaluadaPor: u.username },
      'Evaluación de riesgo y plan de remediación registrados.',
      u.username,
      { estado: { in: ['ABIERTA', 'EN_MITIGACION'] } },
    );
    return this.vulnerabilidades.findOne(id);
  }

  listarAcciones(vulnerabilidadId: number): Promise<AccionRemediacionDto[]> {
    return this.prisma.accionRemediacion.findMany({
      where: { vulnerabilidadId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
  }

  async registrarAccion(
    vulnerabilidadId: number,
    dto: RegistrarAccionDto,
    u: AuthUser,
  ): Promise<AccionRemediacionDto> {
    const v = await this.vulnerabilidades.findOne(vulnerabilidadId);
    this.exigirVigente(v);
    if (v.estado !== 'EN_MITIGACION') {
      throw new ConflictException('Las acciones correctivas se registran con la vulnerabilidad EN_MITIGACION.');
    }
    if (dto.fecha < v.fecha) {
      throw new BadRequestException('La acción no puede ser anterior a la detección.');
    }
    // Después del límite de remediación: excepción de admin justificada (la fecha real se conserva).
    const { motivoExcepcion, ...datos } = dto;
    const excepcion = plazoOExcepcion({
      real: dto.fecha,
      limite: v.fechaLimite,
      que: 'La acción correctiva',
      motivoExcepcion,
      usuario: u,
    });
    return this.prisma.accionRemediacion.create({
      data: { ...datos, ...excepcion, vulnerabilidadId, registradoPor: u.username },
    });
  }

  async anularAccion(id: number, motivo: string, u: AuthUser): Promise<AccionRemediacionDto> {
    await this.trazas.anular('ACCION_REMEDIACION', id, motivo, u.username);
    return this.prisma.accionRemediacion.findUniqueOrThrow({ where: { id } });
  }

  listarVerificaciones(vulnerabilidadId: number): Promise<VerificacionVulnerabilidadDto[]> {
    return this.prisma.verificacionVulnerabilidad.findMany({
      where: { vulnerabilidadId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * EN_MITIGACION: CORREGIDA → MITIGADA (cerrada, con quién la cerró);
   * PERSISTE → sigue en tratamiento. MITIGADA: solo PERSISTE, que la reabre.
   */
  async verificar(
    vulnerabilidadId: number,
    dto: RegistrarVerificacionVulnerabilidadDto,
    u: AuthUser,
  ): Promise<VerificacionVulnerabilidadDto> {
    const v = await this.vulnerabilidades.findOne(vulnerabilidadId);
    this.exigirVigente(v);
    if (v.estado === 'ABIERTA' || v.estado === 'ACEPTADA') {
      throw new ConflictException(
        v.estado === 'ABIERTA'
          ? 'Inicie el tratamiento y registre las acciones antes de verificar.'
          : 'El riesgo fue aceptado: no hay remediación que verificar.',
      );
    }
    if (v.estado === 'MITIGADA' && dto.resultado === 'CORREGIDA') {
      throw new ConflictException('Ya está cerrada como corregida.');
    }
    if (v.estado === 'EN_MITIGACION' && dto.resultado === 'CORREGIDA') {
      const acciones = await this.prisma.accionRemediacion.count({
        where: { vulnerabilidadId, anuladoEn: null },
      });
      if (acciones === 0) {
        throw new BadRequestException('No se puede cerrar sin acciones correctivas registradas.');
      }
    }
    // Su propia ventana prevista (si se programó): fuera de ella, excepción de admin justificada.
    const { motivoExcepcion, ...datos } = dto;
    const excepcion = plazoOExcepcion({
      real: dto.fecha,
      inicio: v.verificacionPrevista,
      limite: v.verificacionLimite,
      que: 'La verificación',
      motivoExcepcion,
      usuario: u,
    });
    return this.prisma.$transaction(async (tx) => {
      const verificacion = await tx.verificacionVulnerabilidad.create({
        data: { ...datos, ...excepcion, vulnerabilidadId, registradoPor: u.username },
      });
      if (dto.resultado === 'CORREGIDA') {
        const { count } = await tx.vulnerabilidad.updateMany({
          where: { id: vulnerabilidadId, estado: 'EN_MITIGACION', anuladoEn: null },
          data: {
            estado: 'MITIGADA',
            fechaCierre: dto.fecha,
            cerradaPor: u.username,
            mitigacion: dto.observaciones,
          },
        });
        if (count === 0) throw new ConflictException('La vulnerabilidad cambió mientras se verificaba.');
        await tx.registroCambio.create({
          data: {
            entidad: 'VULNERABILIDAD',
            registroId: vulnerabilidadId,
            version: v.version,
            accion: 'MODIFICAR',
            motivo: `Cerrada: la verificación confirmó la corrección. Evidencia: ${dto.evidencia}`,
            cambios: JSON.stringify([{ campo: 'estado', antes: 'EN_MITIGACION', despues: 'MITIGADA' }]),
            responsable: u.username,
          },
        });
      } else if (v.estado === 'MITIGADA') {
        // La comprobación detecta que el problema persiste: se reabre.
        const { count } = await tx.vulnerabilidad.updateMany({
          where: { id: vulnerabilidadId, estado: 'MITIGADA', anuladoEn: null },
          // Vuelve al tratamiento: la verificación anterior ya se hizo; la siguiente se programa de nuevo.
          data: { estado: 'EN_MITIGACION', fechaCierre: null, cerradaPor: null, verificacionPrevista: null, verificacionLimite: null },
        });
        if (count === 0) throw new ConflictException('La vulnerabilidad cambió mientras se verificaba.');
        await tx.registroCambio.create({
          data: {
            entidad: 'VULNERABILIDAD',
            registroId: vulnerabilidadId,
            version: v.version,
            accion: 'MODIFICAR',
            motivo: `Reabierta: la verificación detectó que el problema persiste. ${dto.observaciones}`.slice(0, 5000),
            cambios: JSON.stringify([{ campo: 'estado', antes: 'MITIGADA', despues: 'EN_MITIGACION' }]),
            responsable: u.username,
          },
        });
        await this.avisos.avisar(
          {
            tipo: 'VULNERABILIDAD_REABIERTA',
            titulo: `Vulnerabilidad reabierta: ${v.cve ?? `#${v.id}`} en ${v.activo.codigo}`,
            mensaje: dto.observaciones,
            activoId: v.activoId,
          },
          tx,
        );
      }
      return verificacion;
    });
  }

  async anularVerificacion(id: number, motivo: string, u: AuthUser): Promise<VerificacionVulnerabilidadDto> {
    const verificacion = await this.prisma.verificacionVulnerabilidad.findUnique({ where: { id } });
    if (!verificacion) throw new NotFoundException(`La verificación ${id} no existe.`);
    await this.trazas.anular('VERIFICACION_VULNERABILIDAD', id, motivo, u.username);
    return this.prisma.verificacionVulnerabilidad.findUniqueOrThrow({ where: { id } });
  }

  /** Agenda (calendario) de las tres capas en un rango, con los filtros. */
  async agenda(q: QueryAgendaDto): Promise<EventoAgendaDto[]> {
    const rango = { gte: q.desde, lte: q.hasta };
    const deActivo = q.categoriaId ? { activo: { categoriaId: q.categoriaId } } : {};
    const contiene = q.responsable ? { responsable: { contains: q.responsable } } : {};
    const [vulnerabilidades, acciones, verificaciones] = await Promise.all([
      this.prisma.vulnerabilidad.findMany({
        where: {
          anuladoEn: null,
          ...deActivo,
          ...contiene,
          OR: [
            { fecha: rango },
            { fechaLimite: { gte: q.desde }, fecha: { lte: q.hasta } },
            { tratamientoPrevisto: { lte: q.hasta }, OR: [{ fechaLimite: { gte: q.desde } }, { fechaLimite: null }] },
            { tratamientoIniciadoEn: rango },
            { verificacionPrevista: { lte: q.hasta }, OR: [{ verificacionLimite: { gte: q.desde } }, { verificacionLimite: null }] },
            { estado: { in: ['ABIERTA', 'EN_MITIGACION'] }, fecha: { lte: q.hasta } },
          ],
        },
        include: { activo: SELECT_ACTIVO },
        take: 2000,
      }),
      this.prisma.accionRemediacion.findMany({
        where: { anuladoEn: null, fecha: rango, vulnerabilidad: { anuladoEn: null, ...deActivo }, ...contiene },
        include: { vulnerabilidad: { select: { activo: SELECT_ACTIVO } } },
        take: 2000,
      }),
      this.prisma.verificacionVulnerabilidad.findMany({
        where: { anuladoEn: null, fecha: rango, vulnerabilidad: { anuladoEn: null, ...deActivo }, ...contiene },
        include: { vulnerabilidad: { select: { activo: SELECT_ACTIVO } } },
        take: 2000,
      }),
    ]);
    const eventos = agendaVulnerabilidades({
      vulnerabilidades: vulnerabilidades.map((v) => ({ ...v, activo: activoBreve(v.activo) })),
      acciones: acciones.map((a) => ({ ...a, activo: activoBreve(a.vulnerabilidad.activo) })),
      verificaciones: verificaciones.map((x) => ({ ...x, activo: activoBreve(x.vulnerabilidad.activo) })),
      desde: q.desde,
      hasta: q.hasta,
      ahora: new Date(),
      capa: q.capa,
    });
    return q.estado ? eventos.filter((e) => e.estado === q.estado) : eventos;
  }

  /** Capa 3: programa (o reprograma) la ventana de verificación, con su propio plazo. */
  async programarVerificacion(id: number, dto: ProgramarVerificacionDto, u: AuthUser): Promise<VulnerabilidadDto> {
    const v = await this.vulnerabilidades.findOne(id);
    this.exigirVigente(v);
    if (v.estado !== 'EN_MITIGACION' && v.estado !== 'MITIGADA') {
      throw new ConflictException('La verificación se programa durante el tratamiento (o para comprobar una cerrada).');
    }
    if (v.tratamientoIniciadoEn && dto.prevista < v.tratamientoIniciadoEn) {
      throw new BadRequestException('La verificación prevista no puede ser anterior al inicio del tratamiento.');
    }
    exigirReprogramacion(v.verificacionLimite !== null, 'La verificación', u);
    exigirIntervalo(dto.prevista, dto.limite, 'Verificación');
    await this.trazas.modificar(
      'VULNERABILIDAD',
      id,
      { verificacionPrevista: dto.prevista, verificacionLimite: dto.limite },
      'Verificación programada.',
      u.username,
      { estado: { in: ['EN_MITIGACION', 'MITIGADA'] } },
    );
    return this.vulnerabilidades.findOne(id);
  }

  /**
   * Ampliación formal (solo admin, con motivo) del límite de remediación o de la
   * verificación. Se conserva el límite original y queda la traza.
   */
  async ampliarPlazo(id: number, dto: AmpliarPlazoVulnerabilidadDto, u: AuthUser): Promise<VulnerabilidadDto> {
    const v = await this.vulnerabilidades.findOne(id);
    this.exigirVigente(v);
    const actual = dto.campo === 'REMEDIACION' ? v.fechaLimite : v.verificacionLimite;
    if (dto.campo === 'REMEDIACION' && v.estado !== 'ABIERTA' && v.estado !== 'EN_MITIGACION') {
      throw new ConflictException(`La vulnerabilidad está ${v.estado}: ya no tiene plazo de remediación que ampliar.`);
    }
    if (!actual) throw new ConflictException('No hay un límite fijado que ampliar.');
    if (dto.nuevoLimite <= actual) throw new BadRequestException('Ampliar el plazo exige un límite posterior al actual.');
    await this.trazas.modificar(
      'VULNERABILIDAD',
      id,
      dto.campo === 'REMEDIACION'
        ? { fechaLimite: dto.nuevoLimite, fechaLimiteOriginal: v.fechaLimiteOriginal ?? v.fechaLimite }
        : { verificacionLimite: dto.nuevoLimite },
      `Ampliación del plazo de ${dto.campo === 'REMEDIACION' ? 'remediación' : 'verificación'}: ${dto.motivo}`,
      u.username,
    );
    return this.vulnerabilidades.findOne(id);
  }

  private exigirVigente(v: VulnerabilidadDto): void {
    if (v.anuladoEn) throw new ConflictException(`La vulnerabilidad ${v.id} está anulada.`);
  }
}
