-- Retira los restos del diseño anterior de Vulnerabilidades (tres capas: confirmación,
-- evaluación, acciones y verificación). El flujo vigente tiene dos fases (Detección y
-- Remediación) y ya no lee ni escribe nada de esto. Al generar la migración, todo estaba
-- VACÍO en gestion_activos_db y gestion_activos_test, y nada referencia estas tablas.
--
-- NO se toca la verificación antigua de MANTENIMIENTO (tabla verificacion_mantenimiento y
-- columnas mantenimiento.verificacionPrevista/verificacionLimite): guarda datos históricos.
-- Tampoco Verificable (evidencia) ni Repositorio Verificable, que son del flujo vigente.

-- Salvaguarda: si en ESTE entorno hubiera algún dato en lo que se elimina, la migración se
-- detiene aquí («Subquery returns more than 1 row») antes de borrar nada. En ese caso:
-- respaldar, decidir qué hacer con esos datos y volver a ejecutar.
SELECT IF(
  (SELECT COUNT(*) FROM `accion_remediacion`)
  + (SELECT COUNT(*) FROM `verificacion_vulnerabilidad`)
  + (SELECT COUNT(*) FROM `vulnerabilidad`
      WHERE `confirmadaEn` IS NOT NULL OR `confirmadaPor` IS NOT NULL OR `prioridad` IS NOT NULL
         OR `planRemediacion` IS NOT NULL OR `evaluadaEn` IS NOT NULL OR `evaluadaPor` IS NOT NULL
         OR `fechaLimiteOriginal` IS NOT NULL OR `tratamientoPrevisto` IS NOT NULL
         OR `verificacionPrevista` IS NOT NULL OR `verificacionLimite` IS NOT NULL) > 0,
  (SELECT 1 UNION ALL SELECT 2),
  0
) AS `sin_datos_que_perder`;

-- DropForeignKey
ALTER TABLE `accion_remediacion` DROP FOREIGN KEY `accion_remediacion_vulnerabilidadId_fkey`;

-- DropForeignKey
ALTER TABLE `verificacion_vulnerabilidad` DROP FOREIGN KEY `verificacion_vulnerabilidad_vulnerabilidadId_fkey`;

-- AlterTable
ALTER TABLE `vulnerabilidad` DROP COLUMN `confirmadaEn`,
    DROP COLUMN `confirmadaPor`,
    DROP COLUMN `evaluadaEn`,
    DROP COLUMN `evaluadaPor`,
    DROP COLUMN `fechaLimiteOriginal`,
    DROP COLUMN `planRemediacion`,
    DROP COLUMN `prioridad`,
    DROP COLUMN `tratamientoPrevisto`,
    DROP COLUMN `verificacionLimite`,
    DROP COLUMN `verificacionPrevista`;

-- DropTable
DROP TABLE `accion_remediacion`;

-- DropTable
DROP TABLE `verificacion_vulnerabilidad`;
