import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { VulnerabilidadesController } from './vulnerabilidades/vulnerabilidades.controller.js';
import { TratamientoVulnerabilidadController } from './tratamiento/tratamiento.controller.js';
import { TratamientoVulnerabilidadService } from './tratamiento/tratamiento.service.js';
import { VulnerabilidadesService } from './vulnerabilidades/vulnerabilidades.service.js';

/**
 * Control de vulnerabilidades: ABIERTA → EN_MITIGACION → MITIGADA (o ACEPTADA).
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  // Las rutas fijas (lote, acciones/…, verificaciones/…) antes que /vulnerabilidades/:id.
  controllers: [TratamientoVulnerabilidadController, VulnerabilidadesController],
  providers: [VulnerabilidadesService, TratamientoVulnerabilidadService],
})
export class VulnerabilitiesModule {}
