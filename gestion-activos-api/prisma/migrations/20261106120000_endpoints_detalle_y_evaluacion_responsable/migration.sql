-- Homologación de Endpoints y Evaluación (06/11/2026). Solo añade: no borra ni modifica datos.
-- · periodo_endpoint.fechaPlanificada: vacía en los períodos anteriores (no se inventa).
-- · periodo_endpoint_activo: equipos de cada período (activos reales); vacía al crearse.
-- · evaluacion_sistema.responsableEjecucion: vacío en las evaluaciones anteriores.


-- AlterTable
ALTER TABLE `evaluacion_sistema` ADD COLUMN `responsableEjecucion` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `periodo_endpoint` ADD COLUMN `fechaPlanificada` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `periodo_endpoint_activo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodoId` INTEGER NOT NULL,
    `activoId` INTEGER NOT NULL,
    `conAntivirus` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `periodo_endpoint_activo_activoId_idx`(`activoId`),
    UNIQUE INDEX `periodo_endpoint_activo_periodoId_activoId_key`(`periodoId`, `activoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `periodo_endpoint_activo` ADD CONSTRAINT `periodo_endpoint_activo_periodoId_fkey` FOREIGN KEY (`periodoId`) REFERENCES `periodo_endpoint`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `periodo_endpoint_activo` ADD CONSTRAINT `periodo_endpoint_activo_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
