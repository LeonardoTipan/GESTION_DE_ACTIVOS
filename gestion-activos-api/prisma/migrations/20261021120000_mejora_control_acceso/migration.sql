-- Control de acceso: solicitante separado del beneficiario, fecha atendida indicada
-- por quien cierra y retirada de la fecha deseada. Incremental: no borra solicitudes.

-- 1. Antes de retirar `fechaAccesoDeseada`, su valor queda en el historial de cada
--    solicitud (usuario SISTEMA). Además se exportó a CSV y hay un respaldo completo
--    (ver docs/control-acceso.md, «Migración»). Fecha en ISO UTC, como el resto del historial.
INSERT INTO `historial_control_acceso` (`controlAccesoId`, `campo`, `valorAnterior`, `valorNuevo`, `usuario`, `fecha`, `motivo`)
SELECT `id`, 'fechaAccesoDeseada',
       CONCAT(DATE_FORMAT(`fechaAccesoDeseada`, '%Y-%m-%dT%H:%i:%s.'), LPAD(FLOOR(MICROSECOND(`fechaAccesoDeseada`) / 1000), 3, '0'), 'Z'),
       NULL, 'SISTEMA', NOW(3),
       'Campo retirado del modelo (migración 20261021120000_mejora_control_acceso): se conserva aquí su último valor.'
FROM `control_acceso`
WHERE `fechaAccesoDeseada` IS NOT NULL;

-- 2. Solicitante (quien pide o autoriza) separado del beneficiario. NULL en las
--    solicitudes anteriores: no se inventan solicitantes ni cargos.
ALTER TABLE `control_acceso`
    ADD COLUMN `nombreSolicitante` VARCHAR(191) NULL,
    ADD COLUMN `cargoSolicitante` VARCHAR(191) NULL;

-- 3. Se retira la fecha deseada (y su índice); los listados filtran por fecha de solicitud.
DROP INDEX `control_acceso_fechaAccesoDeseada_idx` ON `control_acceso`;
ALTER TABLE `control_acceso` DROP COLUMN `fechaAccesoDeseada`;
CREATE INDEX `control_acceso_fechaSolicitud_idx` ON `control_acceso`(`fechaSolicitud`);
