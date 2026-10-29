-- Evaluación de Sistemas Productivos · fase 2 (ejecución y cierre). Solo AÑADE columnas
-- que admiten nulos a evaluacion_sistema y un índice por la fecha real de las pruebas (para
-- la bitácora por semestre real). Las evaluaciones ya planificadas siguen siendo válidas y no
-- se toca ninguna otra tabla. Los valores son obligatorios al CERRAR (lo exige la API).

-- AlterTable
ALTER TABLE `evaluacion_sistema` ADD COLUMN `cerradoPor` VARCHAR(191) NULL,
    ADD COLUMN `evidencia` VARCHAR(191) NULL,
    ADD COLUMN `fechaPruebas` DATETIME(3) NULL,
    ADD COLUMN `observacion` TEXT NULL,
    ADD COLUMN `repositorioVerificable` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `evaluacion_sistema_fechaPruebas_idx` ON `evaluacion_sistema`(`fechaPruebas`);
