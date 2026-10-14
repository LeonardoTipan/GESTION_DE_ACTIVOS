-- AlterTable
ALTER TABLE `mantenimiento` ADD COLUMN `anuladoEn` DATETIME(3) NULL,
    ADD COLUMN `anuladoPor` VARCHAR(191) NULL,
    ADD COLUMN `motivoAnulacion` TEXT NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `vulnerabilidad` ADD COLUMN `anuladoEn` DATETIME(3) NULL,
    ADD COLUMN `anuladoPor` VARCHAR(191) NULL,
    ADD COLUMN `motivoAnulacion` TEXT NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `plan_respaldo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `frecuencia` ENUM('DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL') NOT NULL,
    `tipo` ENUM('COMPLETO', 'INCREMENTAL', 'DIFERENCIAL', 'SNAPSHOT') NOT NULL,
    `medio` ENUM('DISCO_A_DISCO', 'CINTA_LTO8', 'NUBE_INMUTABLE', 'NAS_SECUNDARIO') NOT NULL,
    `ventana` ENUM('NOCTURNA_22_02', 'NOCTURNA_00_04', 'FIN_DE_SEMANA', 'HORARIO_LABORAL', 'CONTINUA') NOT NULL,
    `retencion` ENUM('DIAS_30', 'DIAS_90', 'MESES_6', 'ANIO_1', 'ANIOS_3', 'ANIOS_7') NOT NULL,
    `frecuenciaPrueba` ENUM('MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL') NOT NULL,
    `rpoHoras` INTEGER NOT NULL,
    `rtoMinutos` INTEGER NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `estado` ENUM('VIGENTE', 'SUSPENDIDO') NOT NULL DEFAULT 'VIGENTE',
    `vigenteDesde` DATETIME(3) NOT NULL,
    `justificacion` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plan_respaldo_activoId_estado_idx`(`activoId`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ejecucion_respaldo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `activoId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `tipo` ENUM('COMPLETO', 'INCREMENTAL', 'DIFERENCIAL', 'SNAPSHOT') NOT NULL,
    `medio` ENUM('DISCO_A_DISCO', 'CINTA_LTO8', 'NUBE_INMUTABLE', 'NAS_SECUNDARIO') NOT NULL,
    `volumenGb` INTEGER NOT NULL,
    `duracionMin` INTEGER NOT NULL,
    `rpoHoras` INTEGER NOT NULL,
    `resultado` ENUM('EXITOSO', 'PARCIAL', 'FALLIDO') NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `cifrado` BOOLEAN NOT NULL,
    `fueraSitio` BOOLEAN NOT NULL,
    `inmutable` BOOLEAN NOT NULL,
    `integridad` BOOLEAN NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ejecucion_respaldo_activoId_fecha_idx`(`activoId`, `fecha`),
    INDEX `ejecucion_respaldo_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restauracion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ejecucionId` INTEGER NOT NULL,
    `activoId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `motivo` ENUM('PRUEBA_PROGRAMADA', 'INCIDENTE_DISPONIBILIDAD', 'SOLICITUD_PROPIETARIO', 'VERIFICACION_INTEGRIDAD') NOT NULL,
    `resultado` ENUM('EXITOSO', 'PARCIAL', 'FALLIDO') NOT NULL,
    `tiempoRealMin` INTEGER NOT NULL,
    `rtoMinutos` INTEGER NOT NULL,
    `integridad` BOOLEAN NOT NULL,
    `evidencia` VARCHAR(191) NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `restauracion_activoId_fecha_idx`(`activoId`, `fecha`),
    INDEX `restauracion_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registro_cambio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entidad` VARCHAR(191) NOT NULL,
    `registroId` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `accion` VARCHAR(191) NOT NULL,
    `motivo` TEXT NOT NULL,
    `cambios` TEXT NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `registro_cambio_entidad_registroId_idx`(`entidad`, `registroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_respaldo` ADD CONSTRAINT `plan_respaldo_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejecucion_respaldo` ADD CONSTRAINT `ejecucion_respaldo_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plan_respaldo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ejecucion_respaldo` ADD CONSTRAINT `ejecucion_respaldo_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restauracion` ADD CONSTRAINT `restauracion_ejecucionId_fkey` FOREIGN KEY (`ejecucionId`) REFERENCES `ejecucion_respaldo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restauracion` ADD CONSTRAINT `restauracion_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

