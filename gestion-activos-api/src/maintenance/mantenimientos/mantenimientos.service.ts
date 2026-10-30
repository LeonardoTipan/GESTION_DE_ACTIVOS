import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TipoMantenimiento } from '../../generated/prisma/enums.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import type { IndicadorDto } from '../../common/indicadores/indicador.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { exigirIntervalo, plazoOExcepcion, SIN_EXCEPCION } from '../../common/plazos/plazos.js';
import type {
  AmpliarPlazoMantenimientoDto,
  CancelarMantenimientoDto,
  CorregirEjecucionDto,
  EditarMantenimientoDto,
  FinalizarMantenimientoDto,
  IniciarMantenimientoDto,
  ProgramarMantenimientoDto,
} from './dto/acciones.dto.js';
import type { MantenimientoDto } from './dto/mantenimiento.dto.js';
import type { QueryMantenimientosDto } from './dto/query-mantenimientos.dto.js';
import {
  estaVencido,
  puedeTransicionar,
  TRANSICIONES,
  type AccionMantenimiento,
} from './transiciones.js';
import { indicadoresMantenimiento } from './indicadores.js';
import { activoBreve, SELECT_ACTIVO } from '../../common/dto/registro.dto.js';
import { BitacoraService } from '../../inventory/bitacora/bitacora.service.js';
import { PlanesMantenimientoService } from '../planes/planes-mantenimiento.service.js';
import { calcularCambios } from '../../inventory/bitacora/cambios.js';
import { exigirFechasReales, exigirRepositorioValido, exigirTipoPermitido, semestreDe } from '../planificacion.js';

const INCLUDE = {
  activo: SELECT_ACTIVO,
  plan: {
    select: {
      id: true, frecuencia: true, tipo: true, fechaInicio: true,
      responsable: true, actividades: true, plazoDias: true, estado: true,
    },
  },
} as const;

/**
 * Solo registros cuyo activo existe. Las claves foráneas lo garantizan, pero si
 * alguien vacía la tabla de activos saltándoselas, un registro huérfano haría
 * fallar la consulta entera (el activo es obligatorio): se ignora en vez de
 * tumbar el módulo. La sincronización con GLPI los detecta y los denuncia.
 */
const CON_ACTIVO = { activo: { id: { gt: 0 } } } as const;

type MantenimientoConActivo = Prisma.MantenimientoGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class MantenimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
    private readonly bitacora: BitacoraService,
    private readonly planes: PlanesMantenimientoService,
  ) {}

  /**
   * Pendientes para el tablero: ejecuciones PROGRAMADO o EN_EJECUCION, no anuladas y con
   * activo (lo mismo que muestra el listado). FINALIZADO y CANCELADO no cuentan; los
   * planes tampoco: se cuenta cada mantenimiento una vez.
   */
  contarPendientes(): Promise<number> {
    return this.prisma.mantenimiento.count({
      where: { fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] }, anuladoEn: null, ...CON_ACTIVO },
    });
  }

  async findAll(
    query: QueryMantenimientosDto,
  ): Promise<Paginated<MantenimientoDto>> {
    const ahora = new Date();
    // Igual que estaVencido(): sin completar y con el límite pasado (sin límite, la fecha programada).
    const vencidos: Prisma.MantenimientoWhereInput = {
      OR: [
        { fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] }, fechaLimite: { lt: ahora } },
        { fase: 'PROGRAMADO', fechaLimite: null, fecha: { lt: ahora } },
      ],
    };
    const filtros: Prisma.MantenimientoWhereInput[] = [
      {
        activoId: query.activoId,
        planId: query.planId,
        ...(query.tecnico ? { tecnico: { contains: query.tecnico } } : {}),
        ...(query.categoriaId ? { activo: { categoriaId: query.categoriaId } } : {}),
        tipo: query.tipo,
        fase: query.fase,
        estadoEquipo: query.estadoEquipo,
      },
    ];
    if (query.desde || query.hasta) {
      filtros.push({ fecha: { gte: query.desde, lte: query.hasta } });
    }
    if (query.vencidos === true) filtros.push(vencidos);
    if (query.vencidos === false) filtros.push({ NOT: vencidos });
    if (query.actualizadoDesde) {
      filtros.push({ updatedAt: { gt: query.actualizadoDesde } });
    }
    if (!query.incluirAnulados) filtros.push({ anuladoEn: null });
    if (query.q) {
      filtros.push({
        OR: [
          { actividad: { contains: query.q } },
          { activo: { codigo: { contains: query.q } } },
          { activo: { nombre: { contains: query.q } } },
        ],
      });
    }
    const where: Prisma.MantenimientoWhereInput = { AND: [...filtros, CON_ACTIVO] };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.mantenimiento.count({ where }),
      this.prisma.mantenimiento.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: query.order }, { id: query.order }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(
      filas.map((m) => conVencido(m, ahora)),
      total,
      query,
    );
  }

  async findOne(id: number): Promise<MantenimientoDto> {
    const mantenimiento = await this.prisma.mantenimiento.findFirst({
      where: { id, ...CON_ACTIVO },
      include: INCLUDE,
    });
    if (!mantenimiento) {
      throw new NotFoundException(`El mantenimiento ${id} no existe.`);
    }
    return conVencido(mantenimiento);
  }

  /**
   * Nueva EJECUCIÓN (Pendiente) de una planificación vigente. El activo, el tipo y
   * la descripción prevista son los de la planificación: no se puede asociar a otra
   * planificación ni a otro activo. No adelanta la próxima fecha del período (eso
   * lo hace «programar» desde la planificación).
   */
  async programar(dto: ProgramarMantenimientoDto, usuario: AuthUser): Promise<MantenimientoDto> {
    const plan = await this.prisma.planMantenimiento.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException(`La planificación ${dto.planId} no existe.`);
    if (dto.activoId !== undefined && dto.activoId !== plan.activoId) {
      throw new BadRequestException(`El activo ${dto.activoId} no es el de la planificación ${dto.planId}.`);
    }
    // Las MISMAS reglas que «Programar» desde el plan: una sola ejecución pendiente (o adicional
    // justificada), no mueve la próxima intervención, alta auditada.
    const { mantenimientoId } = await this.planes.programar(
      dto.planId,
      { fecha: dto.fecha, fechaLimite: dto.fechaLimite, adicional: dto.adicional, justificacion: dto.justificacion },
      usuario,
    );
    return this.findOne(mantenimientoId);
  }

  /**
   * El inicio real se registra tal cual. Si cae fuera de [inicio previsto,
   * límite], solo un admin puede registrarlo como excepción justificada; el
   * plan no se toca. (Los registros sin límite, anteriores a los plazos, no se
   * comprueban.)
   */
  async iniciar(
    id: number,
    dto: IniciarMantenimientoDto,
    usuario?: AuthUser,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'iniciar');
    // La fecha REAL la indica el usuario: no se sustituye por la hora del servidor.
    const fechaInicio = dto.fechaInicio;
    exigirFechasReales(fechaInicio, null);
    const excepcion = actual.fechaLimite
      ? plazoOExcepcion({
          real: fechaInicio,
          inicio: actual.fecha,
          limite: actual.fechaLimite,
          que: 'El inicio del mantenimiento',
          motivoExcepcion: dto.motivoExcepcion,
          usuario,
        })
      : SIN_EXCEPCION;
    return this.aplicar(
      id,
      'iniciar',
      {
        fechaInicio,
        ...(dto.tecnico ? { tecnico: dto.tecnico } : {}),
        ...(excepcion.fueraDePlazo ? excepcion : {}),
      },
      excepcion.fueraDePlazo ? `Inicio de la ejecución, fuera de plazo: ${excepcion.motivoExcepcion}` : 'Inicio de la ejecución.',
      usuario,
    );
  }

  async finalizar(
    id: number,
    dto: FinalizarMantenimientoDto,
    usuario?: AuthUser,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'finalizar');
    // Fecha REAL de finalización, indicada por el usuario (nunca la hora del servidor).
    const fechaFin = dto.fechaFin;
    exigirFechasReales(actual.fechaInicio, fechaFin);
    exigirRepositorioValido(dto.repositorioVerificable);
    const tecnico = dto.tecnico ?? actual.tecnico;
    if (!tecnico) {
      throw new BadRequestException('Indique el técnico que realizó el mantenimiento.');
    }
    // Terminar después del límite: excepción (salvo que ya se registrara una al iniciar).
    const excepcion =
      actual.fechaLimite && !actual.fueraDePlazo
        ? plazoOExcepcion({
            real: fechaFin,
            limite: actual.fechaLimite,
            que: 'El fin del mantenimiento',
            motivoExcepcion: dto.motivoExcepcion,
            usuario,
          })
        : SIN_EXCEPCION;
    const resultado = await this.aplicar(
      id,
      'finalizar',
      {
        ...(excepcion.fueraDePlazo ? excepcion : {}),
        resultado: dto.resultado,
        estadoEquipo: dto.estadoEquipo,
        fechaFin,
        tecnico,
        diagnostico: dto.diagnostico,
        duracionMin: dto.duracionMin,
        costo: dto.costo,
        repuestos: dto.repuestos,
        observaciones: dto.observaciones,
        evidencia: dto.evidencia,
        repositorioVerificable: dto.repositorioVerificable,
      },
      excepcion.fueraDePlazo ? `Ejecución completada, fuera de plazo: ${excepcion.motivoExcepcion}` : 'Ejecución completada.',
      usuario,
    );
    // Se refleja en el activo: su última revisión es la del mantenimiento.
    await this.prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findUniqueOrThrow({ where: { id: actual.activoId } });
      if (activo.ultimaRevision.getTime() >= fechaFin.getTime()) return;
      await tx.activo.update({ where: { id: activo.id }, data: { ultimaRevision: fechaFin } });
      await this.bitacora.registrar(tx, {
        activoId: activo.id,
        accion: 'ACTUALIZAR',
        responsable: usuario?.username ?? tecnico,
        cambios: calcularCambios(activo, { ultimaRevision: fechaFin }),
      });
    });
    // La próxima intervención del plan sale de ESTE fin real (+ período).
    if (actual.planId) await this.planes.recalcularProxima(actual.planId);
    return actual.planId ? this.findOne(id) : resultado;
  }

  /**
   * Cancelar: el mantenimiento no se realizará. Exige el motivo. Se registra el
   * momento de la cancelación aparte: la fecha real de fin queda vacía porque el
   * trabajo no terminó.
   */
  async cancelar(
    id: number,
    dto: CancelarMantenimientoDto,
    usuario?: AuthUser,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'cancelar');
    return this.aplicar(
      id,
      'cancelar',
      { resultado: dto.motivo, fechaCancelacion: new Date() },
      `Ejecución cancelada: ${dto.motivo}`,
      usuario,
    );
  }

  /**
   * Corrige lo EJECUTADO (fechas reales, persona encargada, descripción,
   * observación, verificable, condición del equipo y, justificado, el tipo
   * realmente ejecutado). En ejecución: admin y analista; completada: solo admin.
   * Versionado y auditado en la misma transacción, con el usuario de la sesión.
   */
  async corregirEjecucion(id: number, dto: CorregirEjecucionDto, usuario: AuthUser): Promise<MantenimientoDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    if (actual.anuladoEn) throw new ConflictException(`El mantenimiento ${id} está anulado.`);
    if (actual.fase !== 'EN_EJECUCION' && actual.fase !== 'FINALIZADO') {
      throw new ConflictException(
        `El mantenimiento ${id} está ${actual.fase}: solo se corrige lo ejecutado de uno en ejecución o completado.`,
      );
    }
    if (actual.fase === 'FINALIZADO' && !usuario.roles.includes('admin')) {
      throw new ForbiddenException(`El mantenimiento ${id} está completado: solo un administrador corrige su ejecución.`);
    }
    if (actual.fase === 'EN_EJECUCION' && (datos.fechaFin || datos.resultado || datos.estadoEquipo)) {
      throw new BadRequestException('La fecha de fin, la descripción de la ejecución y la condición del equipo se registran al completar.');
    }
    exigirFechasReales(datos.fechaInicio ?? actual.fechaInicio, datos.fechaFin ?? actual.fechaFin);
    exigirRepositorioValido(datos.repositorioVerificable);
    if (datos.tipo && datos.tipo !== actual.tipo) await this.exigirTipoDelActivo(actual.activoId, datos.tipo);
    await this.trazas.modificar('MANTENIMIENTO', id, datos, motivoCambio, usuario.username, { fase: actual.fase });
    // Corregir el fin real de una completada cambia la próxima intervención del plan.
    if (actual.planId) await this.planes.recalcularProxima(actual.planId);
    return this.findOne(id);
  }

  /** El tipo debe corresponder a la clase (hardware/software) de la categoría del activo. */
  private async exigirTipoDelActivo(activoId: number, tipo: TipoMantenimiento): Promise<void> {
    const activo = await this.prisma.activo.findUniqueOrThrow({
      where: { id: activoId },
      select: { codigo: true, categoria: { select: { nombre: true, claseMantenimiento: true } } },
    });
    exigirTipoPermitido(tipo, activo);
  }

  private validarTransicion(
    actual: MantenimientoDto,
    accion: AccionMantenimiento,
  ): void {
    if (actual.anuladoEn) {
      throw new ConflictException(`El mantenimiento ${actual.id} está anulado: no admite cambios de fase.`);
    }
    if (!puedeTransicionar(actual.fase, accion)) {
      throw new ConflictException(
        `No se puede ${accion} el mantenimiento ${actual.id}: está en fase ${actual.fase}.`,
      );
    }
  }

  /**
   * Cambia de situación con la auditoría común (registro_cambio): el cambio y su
   * traza (situación, fechas reales, responsable…) van en la MISMA transacción,
   * con el usuario de la sesión. Actualización condicional: solo si la situación
   * sigue siendo una de las permitidas y la versión no cambió; si no, 409.
   */
  private async aplicar(
    id: number,
    accion: AccionMantenimiento,
    data: Record<string, unknown>,
    motivo: string,
    usuario?: AuthUser,
  ): Promise<MantenimientoDto> {
    const { desde, hacia } = TRANSICIONES[accion];
    const datos = Object.fromEntries(Object.entries({ ...data, fase: hacia }).filter(([, v]) => v !== undefined));
    await this.trazas.modificar('MANTENIMIENTO', id, datos, motivo.slice(0, 2000), usuario?.username ?? 'SISTEMA', {
      fase: { in: desde },
    });
    return this.findOne(id);
  }


  /**
   * Edita con motivo: sube la versión y conserva la anterior en las trazas.
   * Solo mientras está PROGRAMADO: una vez iniciado, lo planificado es historial.
   */
  async update(
    id: number,
    dto: EditarMantenimientoDto,
    usuario: AuthUser,
  ): Promise<MantenimientoDto> {
    const { motivoCambio, ...datos } = dto;
    const actual = await this.findOne(id);
    if (actual.anuladoEn) {
      throw new ConflictException(`El mantenimiento ${id} está anulado: reviértelo antes de editarlo.`);
    }
    if (actual.fase !== 'PROGRAMADO') {
      throw new ConflictException(
        `El mantenimiento ${id} está en fase ${actual.fase}: solo se puede editar mientras está PROGRAMADO.`,
      );
    }
    exigirIntervalo(datos.fecha ?? actual.fecha, datos.fechaLimite ?? actual.fechaLimite, 'Mantenimiento');
    if (datos.tipo && datos.tipo !== actual.tipo) await this.exigirTipoDelActivo(actual.activoId, datos.tipo);
    await this.trazas.modificar('MANTENIMIENTO', id, datos, motivoCambio, usuario.username, { fase: 'PROGRAMADO' });
    return this.findOne(id);
  }

  /**
   * Ampliación formal del plazo de la ejecución (solo admin, con motivo). Se
   * conserva el límite original y queda la traza.
   */
  async ampliarPlazo(id: number, dto: AmpliarPlazoMantenimientoDto, usuario: AuthUser): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    if (actual.anuladoEn) throw new ConflictException(`El mantenimiento ${id} está anulado.`);
    if (actual.fase !== 'PROGRAMADO' && actual.fase !== 'EN_EJECUCION') {
      throw new ConflictException(`El mantenimiento ${id} está ${actual.fase}: ya no tiene plazo de ejecución que ampliar.`);
    }
    if (!actual.fechaLimite) throw new ConflictException(`El mantenimiento ${id} no tiene fecha límite.`);
    if (dto.nuevoLimite <= actual.fechaLimite) {
      throw new BadRequestException('Ampliar el plazo exige un límite posterior al actual.');
    }
    await this.trazas.modificar(
      'MANTENIMIENTO',
      id,
      { fechaLimite: dto.nuevoLimite, fechaLimiteOriginal: actual.fechaLimiteOriginal ?? actual.fechaLimite },
      `Ampliación del plazo de ejecución: ${dto.motivo}`,
      usuario.username,
      { fase: { in: ['PROGRAMADO', 'EN_EJECUCION'] } },
    );
    return this.findOne(id);
  }

  /** Eliminación lógica (solo admin): se conserva y deja de contar en los indicadores. */
  async anular(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.anular('MANTENIMIENTO', id, motivo, usuario.username);
    const m = await this.findOne(id);
    // Una ejecución anulada deja de contar para la próxima intervención (y viceversa al revertir).
    if (m.planId) await this.planes.recalcularProxima(m.planId);
    return m;
  }

  /** Deshace la anulación (solo admin). */
  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.reversar('MANTENIMIENTO', id, motivo, usuario.username);
    const m = await this.findOne(id);
    if (m.planId) await this.planes.recalcularProxima(m.planId);
    return m;
  }

  /** Indicadores del período (por fecha programada); los anulados no cuentan. */
  async indicadores(desde: Date, hasta: Date): Promise<IndicadorDto[]> {
    const registros = await this.prisma.mantenimiento.findMany({
      where: { anuladoEn: null, fecha: { gte: desde, lte: hasta }, ...CON_ACTIVO },
    });
    return indicadoresMantenimiento(registros, new Date());
  }
}

function conVencido(
  mantenimiento: MantenimientoConActivo,
  ahora = new Date(),
): MantenimientoDto {
  const m = mantenimiento;
  return {
    ...m,
    activo: activoBreve(m.activo),
    costo: m.costo === null ? null : Number(m.costo),
    vencido: estaVencido(m, ahora),
    semestrePlanificado: m.plan ? semestreDe(m.plan.fechaInicio) : null,
    semestreReal: m.fechaInicio ? semestreDe(m.fechaInicio) : null,
  };
}
