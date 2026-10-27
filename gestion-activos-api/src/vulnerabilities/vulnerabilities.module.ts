import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { VulnerabilidadesController } from './vulnerabilidades/vulnerabilidades.controller.js';
import { VulnerabilidadesService } from './vulnerabilidades/vulnerabilidades.service.js';

/**
 * Vulnerabilidades en DOS fases sobre el mismo registro: Detección (ABIERTO) y
 * Remediación (EN_PROGRESO → REMEDIADO, con evidencia). Módulo independiente: del
 * inventario solo usa ActivosService (exportado) para validar el activo.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [VulnerabilidadesController],
  providers: [VulnerabilidadesService],
  // El tablero (DashboardModule) solo usa su conteo de pendientes.
  exports: [VulnerabilidadesService],
})
export class VulnerabilitiesModule {}
