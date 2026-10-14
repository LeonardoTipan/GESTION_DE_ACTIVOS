import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvisosService } from '../../audit/avisos.service.js';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { VulnerabilidadDto } from '../vulnerabilidades/dto/vulnerabilidad.dto.js';
import { VulnerabilidadesService } from '../vulnerabilidades/vulnerabilidades.service.js';
import type {
  AccionRemediacionDto,
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
    return this.prisma.accionRemediacion.create({
      data: { ...dto, vulnerabilidadId, registradoPor: u.username },
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
    return this.prisma.$transaction(async (tx) => {
      const verificacion = await tx.verificacionVulnerabilidad.create({
        data: { ...dto, vulnerabilidadId, registradoPor: u.username },
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
          data: { estado: 'EN_MITIGACION', fechaCierre: null, cerradaPor: null },
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

  private exigirVigente(v: VulnerabilidadDto): void {
    if (v.anuladoEn) throw new ConflictException(`La vulnerabilidad ${v.id} está anulada.`);
  }
}
