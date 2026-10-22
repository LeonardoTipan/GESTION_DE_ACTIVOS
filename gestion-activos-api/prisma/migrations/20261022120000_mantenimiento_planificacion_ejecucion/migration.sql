-- Mantenimiento: Planificación (plan) → Ejecución (mantenimiento). Incremental:
-- no borra tablas, columnas ni registros.

-- 1. Tipos de mantenimiento: se AÑADEN los de hardware (PREDICTIVO) y software
--    (PERFECTIVO, ADAPTATIVO, EVOLUTIVO). Los valores existentes no cambian.
ALTER TABLE `plan_mantenimiento`
    MODIFY `tipo` ENUM('PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO') NOT NULL;
ALTER TABLE `mantenimiento`
    MODIFY `tipo` ENUM('PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO', 'PERFECTIVO', 'ADAPTATIVO', 'EVOLUTIVO') NOT NULL;

-- 2. Clase de mantenimiento por categoría (HARDWARE / SOFTWARE), editable en Catálogos.
--    Inicial según el tipo de GLPI de cada categoría (físico o no), no según el nombre
--    de los activos. Las que no se pueden clasificar con certeza quedan sin clase.
ALTER TABLE `categoria` ADD COLUMN `claseMantenimiento` ENUM('HARDWARE', 'SOFTWARE') NULL;
UPDATE `categoria` SET `claseMantenimiento` = 'HARDWARE'
WHERE `nombre` IN ('Computadoras', 'Servidores físicos', 'Monitores', 'Dispositivos de redes', 'Periféricos', 'Impresoras',
                   'Teléfonos', 'Racks', 'Gabinetes', 'Multitomas', 'Dispositivos pasivos', 'Cables', 'Tomas de red', 'Hardware');
UPDATE `categoria` SET `claseMantenimiento` = 'SOFTWARE'
WHERE `nombre` IN ('Programas', 'Licencias', 'Certificados', 'Aplicativos', 'Servidores virtuales', 'Software');

-- 3. Planificación: fecha de inicio planificada FIJA (la próxima fecha sí avanza al programar).
--    Se añade opcional, se rellena con la próxima fecha (o, si ya no hay, con la fecha de
--    alta del plan) y luego se vuelve obligatoria.
ALTER TABLE `plan_mantenimiento` ADD COLUMN `fechaInicio` DATETIME(3) NULL;
UPDATE `plan_mantenimiento` SET `fechaInicio` = COALESCE(`proximaFecha`, `createdAt`) WHERE `fechaInicio` IS NULL;
ALTER TABLE `plan_mantenimiento` MODIFY `fechaInicio` DATETIME(3) NOT NULL;

-- 4. Ejecución: repositorio del verificable y fecha de cancelación (separada de la fecha
--    real de fin). Las cancelaciones anteriores conservan su fechaFin tal cual; además se
--    copia como fecha de cancelación para no perderla.
ALTER TABLE `mantenimiento`
    ADD COLUMN `repositorioVerificable` VARCHAR(191) NULL,
    ADD COLUMN `fechaCancelacion` DATETIME(3) NULL;
UPDATE `mantenimiento` SET `fechaCancelacion` = `fechaFin` WHERE `fase` = 'CANCELADO' AND `fechaCancelacion` IS NULL;
