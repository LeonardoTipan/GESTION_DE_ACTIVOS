import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MantenimientosController } from './mantenimientos/mantenimientos.controller.js';
import { MantenimientosService } from './mantenimientos/mantenimientos.service.js';

/**
 * Mantenimiento de sistemas: PROGRAMADO → EN_EJECUCION → FINALIZADO (o CANCELADO).
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule],
  controllers: [MantenimientosController],
  providers: [MantenimientosService],
})
export class MaintenanceModule {}
