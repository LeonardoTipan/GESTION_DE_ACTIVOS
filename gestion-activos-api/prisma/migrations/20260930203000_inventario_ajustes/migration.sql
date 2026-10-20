-- AlterTable
ALTER TABLE `activo` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `bitacora_historial` MODIFY `detalle` TEXT NOT NULL;

-- CreateIndex
CREATE INDEX `activo_updatedAt_idx` ON `activo`(`updatedAt`);

-- CreateIndex
CREATE UNIQUE INDEX `categoria_nombre_key` ON `categoria`(`nombre`);

-- CreateIndex
CREATE UNIQUE INDEX `criticidad_nivel_key` ON `criticidad`(`nivel`);
