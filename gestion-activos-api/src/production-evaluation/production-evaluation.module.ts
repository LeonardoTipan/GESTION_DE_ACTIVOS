import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { EvaluacionesController } from './evaluaciones.controller.js';
import { EvaluacionesService } from './evaluaciones.service.js';

/**
 * Evaluación de Sistemas Productivos: evaluación de seguridad antes del paso a
 * producción. Módulo independiente: del inventario solo usa ActivosService (exportado)
 * para exigir un activo operativo de una categoría con aplicaEvaluacion; nunca lo
 * modifica. Fase 1 implementada (planificación); la fase 2 (fecha real de las pruebas
 * e informe verificable) está especificada en docs/requisitos-evaluacion-sistemas.md.
 */
@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
  // Solo para el conteo de pendientes del tablero (DashboardModule).
  exports: [EvaluacionesService],
})
export class ProductionEvaluationModule {}
