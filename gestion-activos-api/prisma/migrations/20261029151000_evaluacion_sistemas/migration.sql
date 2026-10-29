-- Evaluación de Sistemas Productivos · fase 1 (planificación con la fecha PROGRAMADA de
-- paso a producción). Solo CREA su tabla y su clave foránea al activo (RESTRICT: un activo
-- con evaluaciones no se borra físicamente); no toca ninguna tabla existente. Los campos de
-- la fase 2 (fecha real de las pruebas, informe verificable) llegarán en su propia migración.

-- CreateTable
CREATE TABLE `evaluacion_sistema` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `fechaProgramadaProduccion` DATETIME(3) NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `estado` ENUM('ABIERTO', 'EN_PROGRESO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `evaluacion_sistema_activoId_estado_idx`(`activoId`, `estado`),
    INDEX `evaluacion_sistema_fechaProgramadaProduccion_idx`(`fechaProgramadaProduccion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `evaluacion_sistema` ADD CONSTRAINT `evaluacion_sistema_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
