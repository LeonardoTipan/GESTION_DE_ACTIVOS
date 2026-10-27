import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { BitacoraMantenimientoController } from './bitacora/bitacora-mantenimiento.controller.js';
import { BitacoraMantenimientoService } from './bitacora/bitacora-mantenimiento.service.js';
import { MantenimientosController } from './mantenimientos/mantenimientos.controller.js';
import { MantenimientosService } from './mantenimientos/mantenimientos.service.js';
import { PlanesMantenimientoController } from './planes/planes-mantenimiento.controller.js';
import {
  PlanesMantenimientoService,
  VerificacionesMantenimientoService,
} from './planes/planes-mantenimiento.service.js';

/**
 * Mantenimiento en tres capas: planificación (planes con período) →
 * ejecución (PROGRAMADO → EN_EJECUCION → FINALIZADO o CANCELADO) →
 * verificación y cierre. Más las Bitácoras General y Específica (solo lectura).
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  // Las rutas fijas (planes, tablero, bitácoras) se registran antes que /mantenimientos/:id.
  controllers: [PlanesMantenimientoController, BitacoraMantenimientoController, MantenimientosController],
  providers: [
    MantenimientosService,
    PlanesMantenimientoService,
    VerificacionesMantenimientoService,
    BitacoraMantenimientoService,
  ],
  // El tablero (DashboardModule) solo usa su conteo de pendientes.
  exports: [MantenimientosService],
})
export class MaintenanceModule {}
