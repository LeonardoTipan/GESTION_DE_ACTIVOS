import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { RespaldosController } from './respaldos/respaldos.controller.js';
import { RespaldosService } from './respaldos/respaldos.service.js';

/**
 * Respaldos en 3 capas: alcance → ejecución → restauración/prueba.
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule],
  controllers: [RespaldosController],
  providers: [RespaldosService],
})
export class BackupsModule {}
