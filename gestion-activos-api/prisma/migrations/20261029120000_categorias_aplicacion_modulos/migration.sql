-- Elegibilidad de cada categoría para los módulos (la configura el admin en Catálogos;
-- la sincronización con GLPI no la toca). Solo AÑADE columnas y fija valores iniciales:
-- no recrea tablas ni toca activos, relaciones ni registros de los módulos.
--
-- MATRIZ INICIAL PROPUESTA, pendiente de aprobación del usuario antes de aplicarse
-- (docs/categorias-aplicacion.md). Hasta hoy cualquier activo operativo era elegible en
-- Mantenimientos, Vulnerabilidades y Renovaciones.

-- AlterTable
ALTER TABLE `categoria` ADD COLUMN `aplicaEndpoint` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `aplicaEvaluacion` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `aplicaMantenimiento` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `aplicaRenovacion` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `aplicaVulnerabilidad` BOOLEAN NOT NULL DEFAULT false;

-- Mantenimiento: equipos y sistemas que se intervienen (físicos y lógicos).
UPDATE `categoria` SET `aplicaMantenimiento` = true
WHERE `nombre` IN ('Computadoras', 'Dispositivos de redes', 'Servidores físicos', 'Servidores virtuales',
                   'Impresoras', 'Teléfonos', 'Monitores', 'Racks', 'Gabinetes', 'Aplicativos');

-- Vulnerabilidades: lo que ejecuta software o expone servicios (hardware y software).
UPDATE `categoria` SET `aplicaVulnerabilidad` = true
WHERE `nombre` IN ('Computadoras', 'Dispositivos de redes', 'Servidores físicos', 'Servidores virtuales',
                   'Impresoras', 'Teléfonos', 'Aplicativos', 'Programas', 'Certificados');

-- Renovaciones: lo que tiene licencia, garantía, certificado o contrato que caduca.
UPDATE `categoria` SET `aplicaRenovacion` = true
WHERE `nombre` IN ('Computadoras', 'Dispositivos de redes', 'Servidores físicos', 'Servidores virtuales',
                   'Impresoras', 'Aplicativos', 'Programas', 'Licencias', 'Certificados');

-- Preparadas para módulos futuros (aún sin selectores ni operaciones).
UPDATE `categoria` SET `aplicaEvaluacion` = true WHERE `nombre` IN ('Aplicativos');
UPDATE `categoria` SET `aplicaEndpoint` = true
WHERE `nombre` IN ('Computadoras', 'Servidores físicos', 'Servidores virtuales');

-- Salvaguarda: una categoría con registros en un módulo queda habilitada para él, sea cual
-- sea su nombre (ningún registro existente queda en una categoría no elegible).
UPDATE `categoria` c SET c.`aplicaMantenimiento` = true
WHERE EXISTS (SELECT 1 FROM `activo` a JOIN `plan_mantenimiento` p ON p.`activoId` = a.`id` WHERE a.`categoriaId` = c.`id`)
   OR EXISTS (SELECT 1 FROM `activo` a JOIN `mantenimiento` m ON m.`activoId` = a.`id` WHERE a.`categoriaId` = c.`id`);
UPDATE `categoria` c SET c.`aplicaVulnerabilidad` = true
WHERE EXISTS (SELECT 1 FROM `activo` a JOIN `vulnerabilidad` v ON v.`activoId` = a.`id` WHERE a.`categoriaId` = c.`id`);
UPDATE `categoria` c SET c.`aplicaRenovacion` = true
WHERE EXISTS (SELECT 1 FROM `activo` a JOIN `renovacion` r ON r.`activoId` = a.`id` WHERE a.`categoriaId` = c.`id`);
