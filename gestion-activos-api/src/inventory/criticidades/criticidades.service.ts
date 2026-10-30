import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateCriticidadDto,
  CriticidadDto,
  UpdateCriticidadDto,
} from './dto/criticidad.dto.js';

@Injectable()
export class CriticidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
  ) {}

  findAll(): Promise<CriticidadDto[]> {
    return this.prisma.criticidad.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number): Promise<CriticidadDto> {
    const criticidad = await this.prisma.criticidad.findUnique({
      where: { id },
    });
    if (!criticidad) {
      throw new NotFoundException(`La criticidad ${id} no existe.`);
    }
    return criticidad;
  }

  create(dto: CreateCriticidadDto, u: AuthUser): Promise<CriticidadDto> {
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.criticidad.create({ data: dto });
      await this.trazas.registrarCatalogo(tx, 'CRITICIDAD', creado.id, 'REGISTRAR', {}, creado, u.username);
      return creado;
    });
  }

  async update(id: number, dto: UpdateCriticidadDto, u: AuthUser): Promise<CriticidadDto> {
    const actual = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const nuevo = await tx.criticidad.update({ where: { id }, data: dto });
      await this.trazas.registrarCatalogo(tx, 'CRITICIDAD', id, 'MODIFICAR', actual, dto, u.username);
      return nuevo;
    });
  }

  async remove(id: number, u: AuthUser): Promise<void> {
    const actual = await this.findOne(id);
    // Cuenta también los activos dados de baja: siguen referenciando la criticidad.
    const enUso = await this.prisma.activo.count({
      where: { criticidadId: id },
    });
    if (enUso > 0) {
      throw new ConflictException(
        `La criticidad ${id} está asignada a ${enUso} activo(s); reasígnalos antes de eliminarla.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.criticidad.delete({ where: { id } });
      await this.trazas.registrarCatalogo(tx, 'CRITICIDAD', id, 'ELIMINAR', actual, {}, u.username);
    });
  }
}
