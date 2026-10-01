import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BackupsModule } from './backups/backups.module.js';
import { validateEnv } from './config/env.validation.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    InventoryModule,
    BackupsModule,
    MaintenanceModule,
    VulnerabilitiesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
