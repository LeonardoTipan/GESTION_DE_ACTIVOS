import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { RenovacionesController } from './renovaciones.controller.js';
import { RenovacionesService } from './renovaciones.service.js';

/**
 * Renovaciones (licencias, garantías, certificados, contratos de servicio) en DOS
 * fases: Planificación y Ejecución y cierre, con control de caducidad. Módulo
 * independiente: del inventario solo usa ActivosService (exportado) para validar el
 * activo; nunca lo modifica.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [RenovacionesController],
  providers: [RenovacionesService],
})
export class RenewalsModule {}
