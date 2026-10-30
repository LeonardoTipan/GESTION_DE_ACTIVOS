import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TrazasService } from '../../audit/trazas.service.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CategoriaDto,
  CreateCategoriaDto,
  UpdateCategoriaDto,
} from './dto/categoria.dto.js';

@Injectable()
export class CategoriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trazas: TrazasService,
  ) {}

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

  create(dto: CreateCategoriaDto, u: AuthUser): Promise<CategoriaDto> {
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.categoria.create({ data: dto });
      await this.trazas.registrarCatalogo(tx, 'CATEGORIA', creado.id, 'REGISTRAR', {}, creado, u.username);
      return creado;
    });
  }

  async update(id: number, dto: UpdateCategoriaDto, u: AuthUser): Promise<CategoriaDto> {
    const actual = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const nuevo = await tx.categoria.update({ where: { id }, data: dto });
      await this.trazas.registrarCatalogo(tx, 'CATEGORIA', id, 'MODIFICAR', actual, dto, u.username);
      return nuevo;
    });
  }

  async remove(id: number, u: AuthUser): Promise<void> {
    const actual = await this.findOne(id);
    // Cuenta también los activos dados de baja: siguen referenciando la categoría.
    const enUso = await this.prisma.activo.count({
      where: { categoriaId: id },
    });
    if (enUso > 0) {
      throw new ConflictException(
        `La categoría ${id} está asignada a ${enUso} activo(s); reasígnalos antes de eliminarla.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.categoria.delete({ where: { id } });
      await this.trazas.registrarCatalogo(tx, 'CATEGORIA', id, 'ELIMINAR', actual, {}, u.username);
    });
  }
}
