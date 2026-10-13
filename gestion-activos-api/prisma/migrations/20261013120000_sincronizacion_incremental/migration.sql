-- AlterTable
ALTER TABLE `activo` ADD COLUMN `inactivoDesde` DATETIME(3) NULL,
    ADD COLUMN `motivoInactivo` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `sincronizacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `origen` ENUM('MANUAL', 'AUTOMATICA', 'CONSOLA') NOT NULL,
    `modo` ENUM('COMPLETA', 'INCREMENTAL') NOT NULL,
    `estado` ENUM('EN_CURSO', 'EXITOSA', 'CON_ERRORES', 'FALLIDA') NOT NULL DEFAULT 'EN_CURSO',
    `solicitadaPor` VARCHAR(191) NULL,
    `tipos` VARCHAR(191) NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fin` DATETIME(3) NULL,
    `puntoControl` DATETIME(3) NULL,
    `leidos` INTEGER NOT NULL DEFAULT 0,
    `creados` INTEGER NOT NULL DEFAULT 0,
    `actualizados` INTEGER NOT NULL DEFAULT 0,
    `sinCambios` INTEGER NOT NULL DEFAULT 0,
    `inactivados` INTEGER NOT NULL DEFAULT 0,
    `reactivados` INTEGER NOT NULL DEFAULT 0,
    `omitidos` INTEGER NOT NULL DEFAULT 0,
    `errores` INTEGER NOT NULL DEFAULT 0,
    `porRevisar` INTEGER NOT NULL DEFAULT 0,
    `detectados` INTEGER NOT NULL DEFAULT 0,
    `aplicados` INTEGER NOT NULL DEFAULT 0,
    `resumen` TEXT NULL,
    `enCurso` BOOLEAN NULL,

    UNIQUE INDEX `sincronizacion_enCurso_key`(`enCurso`),
    INDEX `sincronizacion_estado_fin_idx`(`estado`, `fin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('ALTA', 'MODIFICACION', 'CAMBIO_ESTADO', 'BAJA_DETECTADA', 'REACTIVACION', 'ERROR_SINCRONIZACION') NOT NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `detalle` TEXT NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `activoId` INTEGER NULL,
    `sincronizacionId` INTEGER NULL,

    INDEX `notificacion_leida_fecha_idx`(`leida`, `fecha`),
    INDEX `notificacion_activoId_idx`(`activoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `activo_deletedAt_inactivoDesde_idx` ON `activo`(`deletedAt`, `inactivoDesde`);

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_sincronizacionId_fkey` FOREIGN KEY (`sincronizacionId`) REFERENCES `sincronizacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

