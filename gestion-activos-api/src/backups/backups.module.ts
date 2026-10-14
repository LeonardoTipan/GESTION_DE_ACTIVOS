import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { EjecucionesRespaldoService, RestauracionesService } from './plan/ejecuciones.service.js';
import {
  EjecucionesRespaldoController,
  PlanesRespaldoController,
  RestauracionesController,
  TableroRespaldosController,
} from './plan/plan.controller.js';
import { PlanesRespaldoService } from './plan/planes.service.js';
import { TableroRespaldosService } from './plan/tablero.service.js';
import { RespaldosController } from './respaldos/respaldos.controller.js';
import { RespaldosService } from './respaldos/respaldos.service.js';

/**
 * Respaldos y restauración (A.8.13, A.5.30) en tres pasos: plan (alcance) →
 * ejecución → restauración o prueba, con indicadores y ventanas programadas.
 * Los registros del modelo anterior se conservan y se consultan aparte.
 *
 * Del inventario solo usa ActivosService (activos operativos) y de la
 * auditoría, TrazasService (versiones y anulación).
 */
@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [
    TableroRespaldosController,
    PlanesRespaldoController,
    EjecucionesRespaldoController,
    RestauracionesController,
    RespaldosController,
  ],
  providers: [
    PlanesRespaldoService,
    EjecucionesRespaldoService,
    RestauracionesService,
    TableroRespaldosService,
    RespaldosService,
  ],
})
export class BackupsModule {}
