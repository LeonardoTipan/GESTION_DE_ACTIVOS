-- Vulnerabilidades en DOS fases (Detección y Remediación) sobre el mismo registro.
-- Incremental: no borra tablas, columnas ni registros. Las columnas se RENOMBRAN
-- (conservan sus datos) en lugar de borrarse y crearse.

-- 1. Estados de la matriz: ABIERTO, EN_PROGRESO, REMEDIADO.
--    Paso intermedio con los valores antiguos y nuevos a la vez, para trasladar los
--    datos que hubiera: ABIERTA → ABIERTO, EN_MITIGACION → EN_PROGRESO,
--    MITIGADA → REMEDIADO. El estado ACEPTADA se retira (decisión del usuario): si
--    quedara alguna fila con él, el paso 1c FALLA (modo estricto) en vez de
--    reinterpretarla, y la migración se detiene sin perder el dato.
ALTER TABLE `vulnerabilidad`
    MODIFY `estado` ENUM('ABIERTA', 'EN_MITIGACION', 'MITIGADA', 'ACEPTADA', 'ABIERTO', 'EN_PROGRESO', 'REMEDIADO') NOT NULL DEFAULT 'ABIERTA';
UPDATE `vulnerabilidad` SET `estado` = 'ABIERTO' WHERE `estado` = 'ABIERTA';
UPDATE `vulnerabilidad` SET `estado` = 'EN_PROGRESO' WHERE `estado` = 'EN_MITIGACION';
UPDATE `vulnerabilidad` SET `estado` = 'REMEDIADO' WHERE `estado` = 'MITIGADA';
ALTER TABLE `vulnerabilidad`
    MODIFY `estado` ENUM('ABIERTO', 'EN_PROGRESO', 'REMEDIADO') NOT NULL DEFAULT 'ABIERTO';

-- 2. «Fecha de Remediación» y «Observación»: se renombran las columnas existentes
--    (fechaCierre ya guardaba la fecha de cierre; mitigacion, el texto de lo hecho).
ALTER TABLE `vulnerabilidad`
    RENAME COLUMN `fechaCierre` TO `fechaRemediacion`,
    RENAME COLUMN `mitigacion` TO `observacion`;

-- 3. «Repositorio Verificable» (el «Verificable» es la columna `evidencia`).
ALTER TABLE `vulnerabilidad` ADD COLUMN `repositorioVerificable` VARCHAR(191) NULL;

-- 4. Filtro habitual: vulnerabilidades de un activo por estado.
CREATE INDEX `vulnerabilidad_activoId_estado_idx` ON `vulnerabilidad`(`activoId`, `estado`);
