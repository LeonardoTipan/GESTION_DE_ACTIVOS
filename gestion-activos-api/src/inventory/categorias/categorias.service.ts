import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CategoriaDto,
  CreateCategoriaDto,
  UpdateCategoriaDto,
} from './dto/categoria.dto.js';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<CategoriaDto[]> {
    return this.prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number): Promise<CategoriaDto> {
    const categoria = await this.prisma.categoria.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException(`La categoría ${id} no existe.`);
    }
    return categoria;
  }

  create(dto: CreateCategoriaDto): Promise<CategoriaDto> {
    return this.prisma.categoria.create({ data: dto });
  }

  async update(id: number, dto: UpdateCategoriaDto): Promise<CategoriaDto> {
    await this.findOne(id);
    return this.prisma.categoria.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    // Cuenta también los activos dados de baja: siguen referenciando la categoría.
    const enUso = await this.prisma.activo.count({
      where: { categoriaId: id },
    });
    if (enUso > 0) {
      throw new ConflictException(
        `La categoría ${id} está asignada a ${enUso} activo(s); reasígnalos antes de eliminarla.`,
      );
    }
    await this.prisma.categoria.delete({ where: { id } });
  }
}
