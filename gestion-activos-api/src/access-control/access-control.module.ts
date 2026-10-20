import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ControlAccesoController } from './control-acceso.controller.js';
import { ControlAccesoService } from './control-acceso.service.js';

/**
 * Control de acceso: solicitudes de acceso lógico y físico, con historial de
 * auditoría transaccional. Módulo independiente: del inventario solo usa
 * ActivosService (exportado) para aplicar la misma regla de activos operativos.
 */
@Module({
  imports: [InventoryModule],
  controllers: [ControlAccesoController],
  providers: [ControlAccesoService],
})
export class AccessControlModule {}
