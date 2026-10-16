import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AmpliarPlazoDto, ProgramarVerificacionDto } from '../../common/dto/agenda.dto.js';
import { diaLocal, exigirExcepcion, exigirIntervalo, plazoOExcepcion, SIN_EXCEPCION } from '../../common/plazos/plazos.js';
import { dentroDeVentana, TEXTO_VENTANA } from './ventana-horaria.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import {
  paginate,
  skipFor,
  type Paginated,
} from '../../common/dto/paginated-response.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivosService } from '../../inventory/activos/activos.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { activoBreve, filtroRegistros, finDelDia, SELECT_ACTIVO } from './dto/comun.dto.js';
import { AvisosService } from '../../audit/avisos.service.js';
import type {
  EjecucionRespaldoDto,
  ModificarEjecucionDto,
  ModificarRestauracionDto,
  QueryEjecucionesDto,
  QueryRestauracionesDto,
  RegistrarEjecucionDto,
  RegistrarRestauracionDto,
  RestauracionDto,
} from './dto/ejecucion.dto.js';
import { PlanesRespaldoService } from './planes.service.js';

const INCLUDE = { activo: SELECT_ACTIVO } as const;
type ConActivo<T> = T & { activo: Parameters<typeof activoBreve>[0] };
const aDto = <T extends object>(r: ConActivo<T>) => ({ ...r, activo: activoBreve(r.activo) });

/** Una fecha REAL no puede ser futura (5 min de margen por el reloj del equipo). */
function exigirNoFutura(fecha: Date | undefined): void {
  if (fecha && fecha.getTime() > Date.now() + 5 * 60_000) {
    throw new BadRequestException('La fecha real no puede ser futura.');
  }
}

/** Filtro de período por fecha del registro. */
const periodo = (desde?: Date, hasta?: Date) =>
  desde || hasta ? { fecha: { gte: desde, lte: hasta ? finDelDia(hasta) : undefined } } : {};

/** Responsable que contiene el texto. */
const responsable = (texto?: string) => (texto ? { responsable: { contains: texto } } : {});

/**
 * Paso 2 · Ejecución del respaldo: cada corrida sobre un activo con plan
 * vigente. Se modifica con motivo (versionado) y se anula, nunca se borra.
 */
@Injectable()
export class EjecucionesRespaldoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly planes: PlanesRespaldoService,
    private readonly trazas: TrazasService,
    private readonly avisos: AvisosService,
  ) {}

  async findAll(query: QueryEjecucionesDto): Promise<Paginated<EjecucionRespaldoDto>> {
    const where: Prisma.EjecucionRespaldoWhereInput = {
      ...filtroRegistros(query),
      planId: query.planId,
      resultado: query.resultado,
      ...periodo(query.desde, query.hasta),
      ...responsable(query.responsable),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.ejecucionRespaldo.count({ where }),
      this.prisma.ejecucionRespaldo.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async findOne(id: number): Promise<EjecucionRespaldoDto> {
    const r = await this.prisma.ejecucionRespaldo.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException(`La ejecución de respaldo ${id} no existe.`);
    return aDto(r);
  }

  /**
   * Registra la ejecución REAL con su fecha y hora. Si cae antes del inicio del
   * plan o fuera de su ventana horaria, solo un admin la registra como excepción
   * justificada: la hora real se conserva y el plan no cambia.
   */
  async registrar(dto: RegistrarEjecucionDto, usuario?: AuthUser): Promise<EjecucionRespaldoDto> {
    exigirNoFutura(dto.fecha);
    const plan = await this.planes.exigirVigente(dto.planId);
    await this.activos.exigirOperativo(plan.activoId);
    const { motivoExcepcion, ...datos } = dto;
    const fuera =
      diaLocal(dto.fecha) < diaLocal(plan.vigenteDesde)
        ? `La ejecución es anterior al inicio previsto del plan (${diaLocal(plan.vigenteDesde)}).`
        : !dentroDeVentana(plan.ventana, dto.fecha)
          ? `La ejecución está fuera de la ventana ${TEXTO_VENTANA[plan.ventana]} del plan.`
          : null;
    const excepcion = fuera ? exigirExcepcion(fuera, motivoExcepcion, usuario) : SIN_EXCEPCION;
    if (dto.pruebaPrevista && dto.pruebaPrevista < dto.fecha) {
      throw new BadRequestException('La prueba de restauración prevista no puede ser anterior a la ejecución.');
    }
    exigirIntervalo(dto.pruebaPrevista, dto.pruebaLimite, 'Prueba de restauración');
    // La misma corrida no se registra dos veces.
    const repetida = await this.prisma.ejecucionRespaldo.findFirst({
      where: { planId: dto.planId, fecha: dto.fecha, anuladoEn: null },
      select: { id: true },
    });
    if (repetida) {
      throw new ConflictException(`Esa ejecución ya está registrada (ejecución ${repetida.id}, misma fecha y hora).`);
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.ejecucionRespaldo.create({
        data: { ...datos, ...excepcion, activoId: plan.activoId },
        include: INCLUDE,
      });
      if (creada.resultado === 'FALLIDO') {
        await this.avisos.avisar(
          {
            tipo: 'RESPALDO_FALLIDO',
            titulo: `Respaldo fallido: ${creada.activo.codigo} · ${creada.activo.nombre}`,
            mensaje: `La ejecución ${creada.id} del plan ${plan.id} terminó con resultado FALLIDO.`,
            activoId: creada.activoId,
          },
          tx,
        );
      }
      return creada;
    });
    return aDto(r);
  }

  async modificar(id: number, dto: ModificarEjecucionDto, usuario: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    exigirNoFutura(datos.fecha);
    await this.trazas.modificar('EJECUCION_RESPALDO', id, datos, motivoCambio, usuario.username);
    return this.findOne(id);
  }

  /** Capa 3: programa (o reprograma) la ventana de la prueba de restauración de esta copia. */
  async programarPrueba(id: number, dto: ProgramarVerificacionDto, usuario: AuthUser): Promise<EjecucionRespaldoDto> {
    const e = await this.findOne(id);
    if (e.anuladoEn || e.resultado === 'FALLIDO') {
      throw new ConflictException(`La ejecución ${id} ${e.anuladoEn ? 'está anulada' : 'falló'}: no hay copia que probar.`);
    }
    if (dto.prevista < e.fecha) {
      throw new BadRequestException('La prueba prevista no puede ser anterior a la ejecución.');
    }
    exigirIntervalo(dto.prevista, dto.limite, 'Prueba de restauración');
    await this.trazas.modificar(
      'EJECUCION_RESPALDO',
      id,
      { pruebaPrevista: dto.prevista, pruebaLimite: dto.limite },
      'Prueba de restauración programada.',
      usuario.username,
    );
    return this.findOne(id);
  }

  /** Amplía formalmente el plazo de la prueba (solo admin); el anterior queda en la traza. */
  async ampliarPlazoPrueba(id: number, dto: AmpliarPlazoDto, usuario: AuthUser): Promise<EjecucionRespaldoDto> {
    const e = await this.findOne(id);
    if (!e.pruebaLimite) throw new ConflictException(`La ejecución ${id} no tiene prueba de restauración programada.`);
    if (dto.nuevoLimite <= e.pruebaLimite) {
      throw new BadRequestException('Ampliar el plazo exige un límite posterior al actual.');
    }
    await this.trazas.modificar(
      'EJECUCION_RESPALDO',
      id,
      { pruebaLimite: dto.nuevoLimite },
      `Ampliación del plazo de la prueba de restauración: ${dto.motivo}`,
      usuario.username,
    );
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.anular('EJECUCION_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.reversar('EJECUCION_RESPALDO', id, motivo, usuario.username);
    return this.findOne(id);
  }
}

/**
 * Paso 3 · Restauración o prueba de un respaldo ejecutado: mide el tiempo real
 * frente al RTO y deja la evidencia (acta o ticket).
 */
@Injectable()
export class RestauracionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activos: ActivosService,
    private readonly trazas: TrazasService,
  ) {}

  async findAll(query: QueryRestauracionesDto): Promise<Paginated<RestauracionDto>> {
    const where: Prisma.RestauracionWhereInput = {
      ...filtroRegistros(query),
      ejecucionId: query.ejecucionId,
      resultado: query.resultado,
      motivo: query.motivo,
      ...periodo(query.desde, query.hasta),
      ...responsable(query.responsable),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.restauracion.count({ where }),
      this.prisma.restauracion.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: skipFor(query),
        take: query.limit,
      }),
    ]);
    return paginate(filas.map(aDto), total, query);
  }

  async findOne(id: number): Promise<RestauracionDto> {
    const r = await this.prisma.restauracion.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException(`La restauración ${id} no existe.`);
    return aDto(r);
  }

  async registrar(dto: RegistrarRestauracionDto, usuario?: AuthUser): Promise<RestauracionDto> {
    exigirNoFutura(dto.fecha);
    const { motivoExcepcion, ...datos } = dto;
    const origen = await this.prisma.ejecucionRespaldo.findUnique({
      where: { id: dto.ejecucionId },
    });
    if (!origen) {
      throw new BadRequestException(`La ejecución de respaldo ${dto.ejecucionId} no existe.`);
    }
    if (origen.anuladoEn || origen.resultado === 'FALLIDO') {
      throw new BadRequestException(
        `La ejecución ${origen.id} ${origen.anuladoEn ? 'está anulada' : 'falló'}: no hay respaldo que restaurar.`,
      );
    }
    if (dto.fecha < origen.fecha) {
      throw new BadRequestException('La restauración no puede ser anterior a la ejecución del respaldo.');
    }
    await this.activos.exigirOperativo(origen.activoId);
    // Una prueba PROGRAMADA exige su ventana prevista y una sola por copia; una
    // restauración real por incidente o solicitud no está programada.
    let excepcion = SIN_EXCEPCION;
    if (dto.motivo === 'PRUEBA_PROGRAMADA') {
      if (!origen.pruebaPrevista) {
        throw new ConflictException(
          `La ejecución ${origen.id} no tiene una prueba de restauración programada: prográmela primero.`,
        );
      }
      const previa = await this.prisma.restauracion.findFirst({
        where: { ejecucionId: origen.id, motivo: 'PRUEBA_PROGRAMADA', anuladoEn: null },
        select: { id: true },
      });
      if (previa) {
        throw new ConflictException(`La prueba programada de esta copia ya está registrada (restauración ${previa.id}).`);
      }
      excepcion = plazoOExcepcion({
        real: dto.fecha,
        inicio: origen.pruebaPrevista,
        limite: origen.pruebaLimite,
        que: 'La prueba de restauración',
        motivoExcepcion,
        usuario,
      });
    }
    const r = await this.prisma.restauracion.create({
      data: { ...datos, ...excepcion, activoId: origen.activoId },
      include: INCLUDE,
    });
    return aDto(r);
  }

  async modificar(id: number, dto: ModificarRestauracionDto, usuario: AuthUser) {
    const { motivoCambio, ...datos } = dto;
    exigirNoFutura(datos.fecha);
    await this.trazas.modificar('RESTAURACION', id, datos, motivoCambio, usuario.username);
    return this.findOne(id);
  }

  async anular(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.anular('RESTAURACION', id, motivo, usuario.username);
    return this.findOne(id);
  }

  async reversar(id: number, motivo: string, usuario: AuthUser) {
    await this.trazas.reversar('RESTAURACION', id, motivo, usuario.username);
    return this.findOne(id);
  }
}
