import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PeriodosEndpointController } from './periodos.controller.js';
import { PeriodosEndpointService } from './periodos.service.js';

/**
 * Protección de Endpoints: medición mensual de la cobertura de antivirus/EDR, con el detalle por
 * equipo (activos operativos de categorías con aplicaEndpoint). Usa el inventario solo para leer
 * los equipos elegibles. Ver docs/requisitos-proteccion-endpoints.md.
 */
@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [PeriodosEndpointController],
  providers: [PeriodosEndpointService],
  // Solo para el conteo de pendientes del tablero (DashboardModule).
  exports: [PeriodosEndpointService],
})
export class EndpointProtectionModule {}
