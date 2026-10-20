-- AlterTable
ALTER TABLE `vulnerabilidad` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `cve` VARCHAR(191) NULL,
    ADD COLUMN `fechaCierre` DATETIME(3) NULL,
    ADD COLUMN `fechaLimite` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `descripcion` TEXT NOT NULL,
    MODIFY `nivelRiesgo` ENUM('BAJO', 'MEDIO', 'ALTO', 'CRITICO') NOT NULL,
    MODIFY `estado` ENUM('ABIERTA', 'EN_MITIGACION', 'MITIGADA', 'ACEPTADA') NOT NULL DEFAULT 'ABIERTA',
    MODIFY `mitigacion` TEXT NULL;

-- CreateIndex
CREATE INDEX `vulnerabilidad_updatedAt_idx` ON `vulnerabilidad`(`updatedAt`);
