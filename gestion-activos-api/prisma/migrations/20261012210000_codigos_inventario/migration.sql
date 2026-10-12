-- AlterTable
ALTER TABLE `activo` ADD COLUMN `codigoInstitucional` VARCHAR(191) NULL,
    ADD COLUMN `direccionIp` VARCHAR(191) NULL,
    ADD COLUMN `fechaCompra` DATETIME(3) NULL,
    ADD COLUMN `numeroInventario` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `activo_numeroInventario_idx` ON `activo`(`numeroInventario`);

-- CreateIndex
CREATE INDEX `activo_codigoInstitucional_idx` ON `activo`(`codigoInstitucional`);
