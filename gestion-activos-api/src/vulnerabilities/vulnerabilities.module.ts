import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { VulnerabilidadesController } from './vulnerabilidades/vulnerabilidades.controller.js';
import { VulnerabilidadesService } from './vulnerabilidades/vulnerabilidades.service.js';

/**
 * Control de vulnerabilidades: ABIERTA → EN_MITIGACION → MITIGADA (o ACEPTADA).
 * Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para validar que el activo existe y está vigente.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [VulnerabilidadesController],
  providers: [VulnerabilidadesService],
})
export class VulnerabilitiesModule {}
