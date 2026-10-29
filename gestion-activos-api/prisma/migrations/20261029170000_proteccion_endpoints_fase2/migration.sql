-- Protección de Endpoints · fase 2 (registro y cierre del mes). Solo AÑADE columnas que
-- admiten nulos a periodo_endpoint: los períodos ya abiertos siguen siendo válidos y no se
-- toca ninguna otra tabla. Los valores son obligatorios al CERRAR (lo exige la API).
-- La cobertura (equiposConAntivirus / totalActivos) se calcula; no se guarda.

-- AlterTable
ALTER TABLE `periodo_endpoint` ADD COLUMN `cerradoPor` VARCHAR(191) NULL,
    ADD COLUMN `equiposConAntivirus` INTEGER NULL,
    ADD COLUMN `evidencia` VARCHAR(191) NULL,
    ADD COLUMN `repositorioVerificable` VARCHAR(191) NULL,
    ADD COLUMN `totalActivos` INTEGER NULL;
