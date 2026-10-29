import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PeriodosEndpointController } from './periodos.controller.js';
import { PeriodosEndpointService } from './periodos.service.js';

/**
 * Protección de Endpoints: medición mensual de la cobertura de antivirus/EDR. Módulo
 * independiente. Fase 1 implementada (apertura del período); la fase 2 (totales,
 * equipos con antivirus y Excel del inventario) está especificada en
 * docs/requisitos-proteccion-endpoints.md. Los equipos elegibles son los activos
 * operativos de categorías con aplicaEndpoint (GET /activos?aplica=ENDPOINT).
 */
@Module({
  imports: [AuditModule],
  controllers: [PeriodosEndpointController],
  providers: [PeriodosEndpointService],
  // Solo para el conteo de pendientes del tablero (DashboardModule).
  exports: [PeriodosEndpointService],
})
export class EndpointProtectionModule {}
