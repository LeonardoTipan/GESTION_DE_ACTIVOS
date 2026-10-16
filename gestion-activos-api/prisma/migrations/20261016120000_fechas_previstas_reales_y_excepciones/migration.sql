-- AlterTable
ALTER TABLE `accion_remediacion` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL;

-- AlterTable
ALTER TABLE `ejecucion_respaldo` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL,
    ADD COLUMN `pruebaLimite` DATETIME(3) NULL,
    ADD COLUMN `pruebaPrevista` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `mantenimiento` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fechaLimite` DATETIME(3) NULL,
    ADD COLUMN `fechaLimiteOriginal` DATETIME(3) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL,
    ADD COLUMN `verificacionLimite` DATETIME(3) NULL,
    ADD COLUMN `verificacionPrevista` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `plan_mantenimiento` ADD COLUMN `plazoDias` INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE `restauracion` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL;

-- AlterTable
ALTER TABLE `verificacion_mantenimiento` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL;

-- AlterTable
ALTER TABLE `verificacion_vulnerabilidad` ADD COLUMN `excepcionPor` VARCHAR(191) NULL,
    ADD COLUMN `fueraDePlazo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoExcepcion` TEXT NULL;

-- AlterTable
ALTER TABLE `vulnerabilidad` ADD COLUMN `fechaLimiteOriginal` DATETIME(3) NULL,
    ADD COLUMN `tratamientoIniciadoEn` DATETIME(3) NULL,
    ADD COLUMN `tratamientoPrevisto` DATETIME(3) NULL,
    ADD COLUMN `verificacionLimite` DATETIME(3) NULL,
    ADD COLUMN `verificacionPrevista` DATETIME(3) NULL;

