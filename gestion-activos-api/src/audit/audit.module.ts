import { Module } from '@nestjs/common';
import { AvisosService } from './avisos.service.js';
import { TrazasController } from './trazas.controller.js';
import { TrazasService } from './trazas.service.js';

/**
 * Trazas de los registros operativos: versiones con motivo, anulación lógica
 * y reversión. Módulo independiente: lo usan respaldos, mantenimientos y
 * vulnerabilidades, y no depende de ninguno de ellos.
 */
@Module({
  controllers: [TrazasController],
  providers: [TrazasService, AvisosService],
  exports: [TrazasService, AvisosService],
})
export class AuditModule {}
