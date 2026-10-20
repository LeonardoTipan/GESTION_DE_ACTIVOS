import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MantenimientosController } from './mantenimientos/mantenimientos.controller.js';
import { MantenimientosService } from './mantenimientos/mantenimientos.service.js';
import { PlanesMantenimientoController } from './planes/planes-mantenimiento.controller.js';
import {
  PlanesMantenimientoService,
  VerificacionesMantenimientoService,
} from './planes/planes-mantenimiento.service.js';

/**
 * Mantenimiento en tres capas: planificación (planes con frecuencia) →
 * ejecución (PROGRAMADO → EN_EJECUCION → FINALIZADO o CANCELADO) →
 * verificación y cierre.
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  // Las rutas fijas (planes, tablero) se registran antes que /mantenimientos/:id.
  controllers: [PlanesMantenimientoController, MantenimientosController],
  providers: [MantenimientosService, PlanesMantenimientoService, VerificacionesMantenimientoService],
})
export class MaintenanceModule {}
