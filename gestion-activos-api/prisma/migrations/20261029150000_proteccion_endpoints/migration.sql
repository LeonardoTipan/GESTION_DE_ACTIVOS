-- Protección de Endpoints · fase 1 (apertura del período mensual). Solo CREA su tabla:
-- no toca ninguna existente. Un período por año y mes (índice único). Los campos de la
-- fase 2 (totales, equipos con antivirus, evidencia) llegarán en su propia migración.

-- CreateTable
CREATE TABLE `periodo_endpoint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `anio` INTEGER NOT NULL,
    `mes` INTEGER NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `observacion` TEXT NULL,
    `estado` ENUM('ABIERTO', 'EN_PROGRESO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
    `version` INTEGER NOT NULL DEFAULT 1,
    `anuladoEn` DATETIME(3) NULL,
    `anuladoPor` VARCHAR(191) NULL,
    `motivoAnulacion` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `periodo_endpoint_estado_idx`(`estado`),
    UNIQUE INDEX `periodo_endpoint_anio_mes_key`(`anio`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
