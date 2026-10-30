-- Protección de Endpoints · fase 2: fecha REAL de la medición del mes y quién la realizó.
-- Solo AÑADE columnas que admiten nulos a periodo_endpoint (los períodos existentes siguen
-- siendo válidos); la API las exige al CERRAR. No toca ninguna otra tabla.

-- AlterTable
ALTER TABLE `periodo_endpoint` ADD COLUMN `fechaEjecucion` DATETIME(3) NULL,
    ADD COLUMN `responsableEjecucion` VARCHAR(191) NULL;
