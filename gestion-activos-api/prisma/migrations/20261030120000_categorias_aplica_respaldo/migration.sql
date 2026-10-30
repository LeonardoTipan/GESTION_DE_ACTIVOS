-- Respaldos: elegibilidad por categoría (Catálogos > Categorías), como las demás banderas de
-- aplicación. Solo AÑADE una columna y fija valores iniciales: no toca activos, planes ni
-- ejecuciones. El inventario sigue siendo general; la bandera solo filtra el selector del
-- módulo y se exige al crear o reactivar un plan de respaldo.

-- AlterTable
ALTER TABLE `categoria` ADD COLUMN `aplicaRespaldo` BOOLEAN NOT NULL DEFAULT false;

-- Matriz inicial (ajustable en Catálogos): servidores y sistemas de negocio.
UPDATE `categoria` SET `aplicaRespaldo` = true
WHERE `nombre` IN ('Servidores físicos', 'Servidores virtuales', 'Aplicativos');

-- Salvaguarda: una categoría con planes de respaldo (de cualquier activo, incluso anulados)
-- queda habilitada, sea cual sea su nombre: ningún plan existente queda en una categoría no
-- elegible.
UPDATE `categoria` c SET c.`aplicaRespaldo` = true
WHERE EXISTS (SELECT 1 FROM `activo` a JOIN `plan_respaldo` p ON p.`activoId` = a.`id` WHERE a.`categoriaId` = c.`id`);
