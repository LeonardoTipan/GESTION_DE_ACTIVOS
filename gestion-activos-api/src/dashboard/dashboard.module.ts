import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/**
 * Tablero principal: solo lectura y solo consolida lo que exporta cada módulo
 * (su conteo de pendientes). Ningún módulo depende de este.
 */
@Module({
  imports: [AccessControlModule, MaintenanceModule, VulnerabilitiesModule, RenewalsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
