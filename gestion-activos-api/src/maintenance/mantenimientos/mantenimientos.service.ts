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
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ProgramarVerificacionDto } from '../../common/dto/agenda.dto.js';
import { exigirIntervalo, plazoOExcepcion, SIN_EXCEPCION } from '../../common/plazos/plazos.js';
import type {
  AmpliarPlazoMantenimientoDto,
  CancelarMantenimientoDto,
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
import { calcularCambios } from '../../inventory/bitacora/cambios.js';
import { cierreDe } from '../planes/frecuencia.js';

const INCLUDE = {
  activo: SELECT_ACTIVO,
  verificaciones: { select: { resultado: true, anuladoEn: true }, orderBy: { id: 'asc' } },
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
  ) {}

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
    if (query.cierre === 'PENDIENTE_VERIFICACION') {
      filtros.push({ fase: 'FINALIZADO', verificaciones: { none: { anuladoEn: null } } });
    }
    if (query.cierre === 'CERRADO') {
      filtros.push({ verificaciones: { some: { anuladoEn: null, resultado: 'OPERATIVO' } } });
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

  /** Crea el mantenimiento en fase PROGRAMADO. El activo debe estar vigente. */
  async programar(dto: ProgramarMantenimientoDto): Promise<MantenimientoDto> {
    // Validado aquí, en el backend: la interfaz solo ofrece equipos operativos,
    // pero la regla no depende de ella.
    await this.activos.exigirOperativo(dto.activoId);
    exigirIntervalo(dto.fecha, dto.fechaLimite, 'Mantenimiento');
    const mantenimiento = await this.prisma.mantenimiento.create({
      data: dto,
      include: INCLUDE,
    });
    return conVencido(mantenimiento);
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
    const fechaInicio = dto.fechaInicio ?? new Date();
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
    return this.aplicar(id, 'iniciar', {
      fechaInicio,
      ...(dto.tecnico ? { tecnico: dto.tecnico } : {}),
      ...(excepcion.fueraDePlazo ? excepcion : {}),
    });
  }

  async finalizar(
    id: number,
    dto: FinalizarMantenimientoDto,
    usuario?: AuthUser,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'finalizar');
    const fechaFin = dto.fechaFin ?? new Date();
    if (actual.fechaInicio && fechaFin < actual.fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la de inicio.',
      );
    }
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
    // Capa 3: ventana prevista de verificación, propia (no tiene que caber en el plazo de la ejecución).
    if (dto.verificacionPrevista && dto.verificacionPrevista < fechaFin) {
      throw new BadRequestException('La verificación prevista no puede ser anterior al fin del mantenimiento.');
    }
    exigirIntervalo(dto.verificacionPrevista, dto.verificacionLimite, 'Verificación');
    const resultado = await this.aplicar(id, 'finalizar', {
      ...(excepcion.fueraDePlazo ? excepcion : {}),
      verificacionPrevista: dto.verificacionPrevista,
      verificacionLimite: dto.verificacionLimite,
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
    });
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
    return resultado;
  }

  async cancelar(
    id: number,
    dto: CancelarMantenimientoDto,
  ): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    this.validarTransicion(actual, 'cancelar');
    return this.aplicar(id, 'cancelar', {
      resultado: dto.motivo,
      fechaFin: new Date(),
    });
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
   * Cambia de fase con una actualización condicional: solo se aplica si la
   * fase sigue siendo una de las permitidas. Si otra petición se adelantó, 409.
   */
  private async aplicar(
    id: number,
    accion: AccionMantenimiento,
    data: Prisma.MantenimientoUpdateManyMutationInput,
  ): Promise<MantenimientoDto> {
    const { desde, hacia } = TRANSICIONES[accion];
    const { count } = await this.prisma.mantenimiento.updateMany({
      where: { id, fase: { in: desde }, anuladoEn: null },
      data: { ...data, fase: hacia },
    });
    if (count === 0) {
      throw new ConflictException(
        `El mantenimiento ${id} cambió de fase mientras se procesaba; vuelve a consultarlo.`,
      );
    }
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
    await this.trazas.modificar('MANTENIMIENTO', id, datos, motivoCambio, usuario.username, { fase: 'PROGRAMADO' });
    return this.findOne(id);
  }

  /**
   * Ampliación formal del plazo (solo admin, con motivo): de la ejecución, o de
   * la verificación prevista. Se conserva el límite original y queda la traza.
   */
  async ampliarPlazo(id: number, dto: AmpliarPlazoMantenimientoDto, usuario: AuthUser): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    if (actual.anuladoEn) throw new ConflictException(`El mantenimiento ${id} está anulado.`);
    if (dto.campo === 'EJECUCION') {
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
    } else {
      if (actual.fase !== 'FINALIZADO' || actual.cierre === 'CERRADO') {
        throw new ConflictException(`El mantenimiento ${id} no tiene una verificación pendiente.`);
      }
      if (!actual.verificacionLimite) throw new ConflictException(`El mantenimiento ${id} no tiene verificación programada.`);
      if (dto.nuevoLimite <= actual.verificacionLimite) {
        throw new BadRequestException('Ampliar el plazo exige un límite posterior al actual.');
      }
      await this.trazas.modificar(
        'MANTENIMIENTO',
        id,
        { verificacionLimite: dto.nuevoLimite },
        `Ampliación del plazo de verificación: ${dto.motivo}`,
        usuario.username,
        { fase: 'FINALIZADO' },
      );
    }
    return this.findOne(id);
  }

  /** Capa 3: programa (o reprograma) la ventana de verificación de un mantenimiento finalizado. */
  async programarVerificacion(id: number, dto: ProgramarVerificacionDto, usuario: AuthUser): Promise<MantenimientoDto> {
    const actual = await this.findOne(id);
    if (actual.anuladoEn) throw new ConflictException(`El mantenimiento ${id} está anulado.`);
    if (actual.fase !== 'FINALIZADO' || actual.cierre === 'CERRADO') {
      throw new ConflictException('Solo se programa la verificación de un mantenimiento finalizado y aún sin cerrar.');
    }
    if (actual.fechaFin && dto.prevista < actual.fechaFin) {
      throw new BadRequestException('La verificación prevista no puede ser anterior al fin del mantenimiento.');
    }
    exigirIntervalo(dto.prevista, dto.limite, 'Verificación');
    await this.trazas.modificar(
      'MANTENIMIENTO',
      id,
      { verificacionPrevista: dto.prevista, verificacionLimite: dto.limite },
      'Verificación programada.',
      usuario.username,
      { fase: 'FINALIZADO' },
    );
    return this.findOne(id);
  }

  /** Eliminación lógica (solo admin): se conserva y deja de contar en los indicadores. */
  async anular(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.anular('MANTENIMIENTO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  /** Deshace la anulación (solo admin). */
  async reversar(id: number, motivo: string, usuario: AuthUser): Promise<MantenimientoDto> {
    await this.findOne(id);
    await this.trazas.reversar('MANTENIMIENTO', id, motivo, usuario.username);
    return this.findOne(id);
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
  const { verificaciones, ...m } = mantenimiento;
  return {
    ...m,
    activo: activoBreve(m.activo),
    costo: m.costo === null ? null : Number(m.costo),
    vencido: estaVencido(m, ahora),
    cierre: cierreDe(m.fase, verificaciones),
  };
}
