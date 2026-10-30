import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { EndpointProtectionModule } from '../endpoint-protection/endpoint-protection.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ProductionEvaluationModule } from '../production-evaluation/production-evaluation.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { IndicadoresTableroService } from './indicadores.service.js';

/**
 * Tablero principal: solo lectura y solo consolida lo que exporta cada módulo
 * (su conteo de pendientes). Ningún módulo depende de este.
 */
@Module({
  imports: [
    AccessControlModule,
    MaintenanceModule,
    VulnerabilitiesModule,
    RenewalsModule,
    EndpointProtectionModule,
    ProductionEvaluationModule,
    InventoryModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, IndicadoresTableroService],
})
export class DashboardModule {}
