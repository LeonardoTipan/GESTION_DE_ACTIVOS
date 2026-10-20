import { Module } from '@nestjs/common';
import {
  GlpiSyncController,
  NotificacionesController,
} from './glpi-sync.controller.js';
import { FabricaSincronizador, GlpiSyncService } from './glpi-sync.service.js';
import { NotificacionesService } from './notificaciones.service.js';

/**
 * Sincronización con GLPI desde la aplicación: botón manual, estado y avisos.
 * Módulo independiente: no importa ningún otro módulo de negocio. Reutiliza el
 * mismo motor que el proceso automático (src/glpi-sync), y el bloqueo de la
 * base impide que ambos escriban a la vez.
 */
@Module({
  controllers: [GlpiSyncController, NotificacionesController],
  providers: [GlpiSyncService, FabricaSincronizador, NotificacionesService],
})
export class GlpiSyncModule {}
