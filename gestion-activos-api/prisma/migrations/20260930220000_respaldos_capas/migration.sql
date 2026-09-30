-- AlterTable
ALTER TABLE `respaldo` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `estadoEjecucion` ENUM('PENDIENTE', 'EXITOSA', 'FALLIDA') NOT NULL DEFAULT 'PENDIENTE',
    MODIFY `fechaEjecucion` DATETIME(3) NULL,
    MODIFY `rutaEvidencia` VARCHAR(191) NULL,
    MODIFY `estadoPrueba` ENUM('PENDIENTE', 'APROBADA', 'FALLIDA') NOT NULL DEFAULT 'PENDIENTE',
    MODIFY `resultadoPrueba` VARCHAR(191) NULL,
    MODIFY `fechaPrueba` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `respaldo_updatedAt_idx` ON `respaldo`(`updatedAt`);
