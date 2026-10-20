-- AlterTable
ALTER TABLE `activo` ADD COLUMN `origenGlpi` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `activo_origenGlpi_key` ON `activo`(`origenGlpi`);
