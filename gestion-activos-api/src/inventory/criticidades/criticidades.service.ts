import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateCriticidadDto,
  CriticidadDto,
  UpdateCriticidadDto,
} from './dto/criticidad.dto.js';

@Injectable()
export class CriticidadesService {
  constructor(private readonly prisma: PrismaService) {}

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

  create(dto: CreateCriticidadDto): Promise<CriticidadDto> {
    return this.prisma.criticidad.create({ data: dto });
  }

  async update(id: number, dto: UpdateCriticidadDto): Promise<CriticidadDto> {
    await this.findOne(id);
    return this.prisma.criticidad.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    // Cuenta también los activos dados de baja: siguen referenciando la criticidad.
    const enUso = await this.prisma.activo.count({
      where: { criticidadId: id },
    });
    if (enUso > 0) {
      throw new ConflictException(
        `La criticidad ${id} está asignada a ${enUso} activo(s); reasígnalos antes de eliminarla.`,
      );
    }
    await this.prisma.criticidad.delete({ where: { id } });
  }
}
