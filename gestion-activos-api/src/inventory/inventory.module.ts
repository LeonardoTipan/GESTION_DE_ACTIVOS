import { Module } from '@nestjs/common';
import { ActivosController } from './activos/activos.controller.js';
import { ActivosService } from './activos/activos.service.js';
import { BitacoraService } from './bitacora/bitacora.service.js';
import { CategoriasController } from './categorias/categorias.controller.js';
import { CategoriasService } from './categorias/categorias.service.js';
import { CriticidadesController } from './criticidades/criticidades.controller.js';
import { CriticidadesService } from './criticidades/criticidades.service.js';

/** Inventario de activos: catálogos, activos y su bitácora de cambios. */
@Module({
  controllers: [
    ActivosController,
    CategoriasController,
    CriticidadesController,
  ],
  providers: [
    ActivosService,
    CategoriasService,
    CriticidadesService,
    BitacoraService,
  ],
  // Los módulos siguientes (respaldos, mantenimiento, vulnerabilidades) validarán activos.
  exports: [ActivosService, BitacoraService],
})
export class InventoryModule {}
