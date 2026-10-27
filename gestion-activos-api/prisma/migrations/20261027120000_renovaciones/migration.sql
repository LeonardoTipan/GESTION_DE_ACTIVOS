-- Módulo de Renovaciones: tabla nueva. No modifica ni borra tablas existentes.
-- La FK al activo es RESTRICT: un activo con renovaciones no se borra físicamente
-- (su historial se conserva); la cadena entre renovaciones usa SET NULL.

-- CreateTable
CREATE TABLE `renovacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `tipo` ENUM('LICENCIA', 'GARANTIA', 'CERTIFICADO', 'CONTRATO_SERVICIO', 'OTRO') NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `fechaPlanificada` DATE NOT NULL,
    `fechaCaducidadActual` DATE NULL,
    `sinCaducidadActual` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('ABIERTO', 'EN_PROGRESO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
    `fechaRenovacion` DATE NULL,
    `nuevaFechaCaducidad` DATE NULL,
    `nuevaSinCaducidad` BOOLEAN NOT NULL DEFAULT false,
    `evidencia` VARCHAR(191) NULL,
    `repositorioVerificable` VARCHAR(191) NULL,
    `descripcion` TEXT NULL,
    `observacion` TEXT NULL,
    `cerradaPor` VARCHAR(191) NULL,
    `renovacionAnteriorId` INTEGER NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `renovacion_activoId_tipo_idx`(`activoId`, `tipo`),
    INDEX `renovacion_estado_idx`(`estado`),
    INDEX `renovacion_fechaCaducidadActual_idx`(`fechaCaducidadActual`),
    INDEX `renovacion_nuevaFechaCaducidad_idx`(`nuevaFechaCaducidad`),
    INDEX `renovacion_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `renovacion` ADD CONSTRAINT `renovacion_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `renovacion` ADD CONSTRAINT `renovacion_renovacionAnteriorId_fkey` FOREIGN KEY (`renovacionAnteriorId`) REFERENCES `renovacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

