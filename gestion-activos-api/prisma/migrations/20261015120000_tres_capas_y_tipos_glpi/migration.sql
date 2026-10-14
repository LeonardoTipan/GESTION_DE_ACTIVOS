-- AlterTable
ALTER TABLE `ejecucion_respaldo` ADD COLUMN `evidencia` VARCHAR(191) NULL,
    ADD COLUMN `observaciones` TEXT NULL;

-- AlterTable
ALTER TABLE `mantenimiento` ADD COLUMN `costo` DECIMAL(12, 2) NULL,
    ADD COLUMN `diagnostico` TEXT NULL,
    ADD COLUMN `duracionMin` INTEGER NULL,
    ADD COLUMN `evidencia` VARCHAR(191) NULL,
    ADD COLUMN `observaciones` TEXT NULL,
    ADD COLUMN `planId` INTEGER NULL,
    ADD COLUMN `repuestos` TEXT NULL,
    ADD COLUMN `tecnico` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `notificacion` MODIFY `tipo` ENUM('ALTA', 'MODIFICACION', 'CAMBIO_ESTADO', 'BAJA_DETECTADA', 'REACTIVACION', 'ERROR_SINCRONIZACION', 'RESPALDO_FALLIDO', 'MANTENIMIENTO_NO_SATISFACTORIO', 'VULNERABILIDAD_CRITICA', 'VULNERABILIDAD_REABIERTA') NOT NULL;

-- AlterTable
ALTER TABLE `restauracion` ADD COLUMN `observaciones` TEXT NULL;

-- AlterTable
ALTER TABLE `vulnerabilidad` ADD COLUMN `cerradaPor` VARCHAR(191) NULL,
    ADD COLUMN `confirmadaEn` DATETIME(3) NULL,
    ADD COLUMN `confirmadaPor` VARCHAR(191) NULL,
    ADD COLUMN `evaluadaEn` DATETIME(3) NULL,
    ADD COLUMN `evaluadaPor` VARCHAR(191) NULL,
    ADD COLUMN `evidencia` VARCHAR(191) NULL,
    ADD COLUMN `fuente` ENUM('MANUAL', 'ESCANEO', 'AUDITORIA', 'BOLETIN_PROVEEDOR', 'PRUEBA_PENETRACION', 'REPORTE_USUARIO') NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `planRemediacion` TEXT NULL,
    ADD COLUMN `prioridad` ENUM('P1', 'P2', 'P3', 'P4') NULL,
    ADD COLUMN `responsable` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `plan_mantenimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `tipo` ENUM('PREVENTIVO', 'CORRECTIVO') NOT NULL,
    `frecuencia` ENUM('UNICA', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL') NOT NULL,
    `proximaFecha` DATETIME(3) NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `actividades` TEXT NOT NULL,
    `estado` ENUM('VIGENTE', 'SUSPENDIDO') NOT NULL DEFAULT 'VIGENTE',
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plan_mantenimiento_activoId_estado_idx`(`activoId`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verificacion_mantenimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mantenimientoId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `resultado` ENUM('OPERATIVO', 'REQUIERE_SEGUIMIENTO', 'NO_SATISFACTORIO') NOT NULL,
    `observaciones` TEXT NOT NULL,
    `evidencia` VARCHAR(191) NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `registradoPor` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verificacion_mantenimiento_mantenimientoId_idx`(`mantenimientoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accion_remediacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vulnerabilidadId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `evidencia` VARCHAR(191) NULL,
    `registradoPor` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `accion_remediacion_vulnerabilidadId_idx`(`vulnerabilidadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verificacion_vulnerabilidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vulnerabilidadId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `resultado` ENUM('CORREGIDA', 'PERSISTE') NOT NULL,
    `observaciones` TEXT NOT NULL,
    `evidencia` VARCHAR(191) NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `registradoPor` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verificacion_vulnerabilidad_vulnerabilidadId_idx`(`vulnerabilidadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `mantenimiento_planId_idx` ON `mantenimiento`(`planId`);

-- AddForeignKey
ALTER TABLE `mantenimiento` ADD CONSTRAINT `mantenimiento_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plan_mantenimiento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_mantenimiento` ADD CONSTRAINT `plan_mantenimiento_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verificacion_mantenimiento` ADD CONSTRAINT `verificacion_mantenimiento_mantenimientoId_fkey` FOREIGN KEY (`mantenimientoId`) REFERENCES `mantenimiento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accion_remediacion` ADD CONSTRAINT `accion_remediacion_vulnerabilidadId_fkey` FOREIGN KEY (`vulnerabilidadId`) REFERENCES `vulnerabilidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verificacion_vulnerabilidad` ADD CONSTRAINT `verificacion_vulnerabilidad_vulnerabilidadId_fkey` FOREIGN KEY (`vulnerabilidadId`) REFERENCES `vulnerabilidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Catálogo: una categoría por tipo de activo de GLPI (base de la clasificación del inventario).
-- INSERT IGNORE: si ya existe una categoría con ese nombre, se conserva tal cual.
INSERT IGNORE INTO `categoria` (`nombre`, `descripcion`) VALUES
  ('Computadoras', 'Tipo de activo de GLPI: Computer'),
  ('Monitores', 'Tipo de activo de GLPI: Monitor'),
  ('Programas', 'Tipo de activo de GLPI: Software'),
  ('Dispositivos de redes', 'Tipo de activo de GLPI: NetworkEquipment'),
  ('Periféricos', 'Tipo de activo de GLPI: Peripheral'),
  ('Impresoras', 'Tipo de activo de GLPI: Printer'),
  ('Teléfonos', 'Tipo de activo de GLPI: Phone'),
  ('Racks', 'Tipo de activo de GLPI: Rack'),
  ('Gabinetes', 'Tipo de activo de GLPI: Enclosure'),
  ('Multitomas', 'Tipo de activo de GLPI: PDU'),
  ('Dispositivos pasivos', 'Tipo de activo de GLPI: PassiveDCEquipment'),
  ('Cables', 'Tipo de activo de GLPI: Cable'),
  ('Tomas de red', 'Tipo de activo de GLPI: Socket'),
  ('Licencias', 'Tipo de activo de GLPI: SoftwareLicense'),
  ('Certificados', 'Tipo de activo de GLPI: Certificate'),
  ('Aplicativos', 'Tipo de activo de GLPI: Appliance');

-- Los activos ya importados desde GLPI pasan a la categoría de su tipo. Cada cambio
-- queda en su historial (responsable SISTEMA), con la categoría anterior y la nueva.
INSERT INTO `bitacora_historial` (`activoId`, `accion`, `responsable`, `fecha`, `detalle`)
SELECT a.`id`, 'ACTUALIZAR', 'SISTEMA', NOW(3),
       JSON_OBJECT('categoriaId', JSON_OBJECT('antes', a.`categoriaId`, 'despues', c.`id`))
FROM `activo` a
JOIN `categoria` c ON c.`descripcion` = CONCAT('Tipo de activo de GLPI: ', SUBSTRING_INDEX(a.`origenGlpi`, ' #', 1))
WHERE a.`origenGlpi` IS NOT NULL AND a.`categoriaId` <> c.`id`;

UPDATE `activo` a
JOIN `categoria` c ON c.`descripcion` = CONCAT('Tipo de activo de GLPI: ', SUBSTRING_INDEX(a.`origenGlpi`, ' #', 1))
SET a.`categoriaId` = c.`id`, a.`updatedAt` = NOW(3)
WHERE a.`origenGlpi` IS NOT NULL AND a.`categoriaId` <> c.`id`;
