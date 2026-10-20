-- AlterTable
ALTER TABLE `categoria` ADD COLUMN `admiteAccesoFisico` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `admiteAccesoLogico` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `control_acceso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigoUnico` VARCHAR(20) NOT NULL,
    `tipoAcceso` ENUM('LOGICO', 'FISICO') NOT NULL,
    `activoId` INTEGER NULL,
    `recurso` VARCHAR(191) NULL,
    `fechaSolicitud` DATETIME(3) NOT NULL,
    `fechaAccesoDeseada` DATETIME(3) NOT NULL,
    `nombreUsuarioBeneficiario` VARCHAR(191) NOT NULL,
    `departamento` VARCHAR(191) NOT NULL,
    `tipoSolicitud` ENUM('ACCESO', 'BAJA') NOT NULL,
    `descripcion` TEXT NOT NULL,
    `estado` ENUM('ABIERTO', 'PENDIENTE', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
    `resolucion` TEXT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fechaAtendido` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `control_acceso_codigoUnico_key`(`codigoUnico`),
    INDEX `control_acceso_tipoAcceso_estado_idx`(`tipoAcceso`, `estado`),
    INDEX `control_acceso_fechaAccesoDeseada_idx`(`fechaAccesoDeseada`),
    INDEX `control_acceso_activoId_idx`(`activoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_control_acceso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `controlAccesoId` INTEGER NOT NULL,
    `campo` VARCHAR(64) NOT NULL,
    `valorAnterior` TEXT NULL,
    `valorNuevo` TEXT NULL,
    `usuario` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `motivo` TEXT NULL,

    INDEX `historial_control_acceso_controlAccesoId_fecha_idx`(`controlAccesoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contador_control_acceso` (
    `tipoAcceso` ENUM('LOGICO', 'FISICO') NOT NULL,
    `ultimo` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`tipoAcceso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `control_acceso` ADD CONSTRAINT `control_acceso_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_control_acceso` ADD CONSTRAINT `historial_control_acceso_controlAccesoId_fkey` FOREIGN KEY (`controlAccesoId`) REFERENCES `control_acceso`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- «Un activo o un recurso» se valida en el backend: MySQL no admite un CHECK sobre activoId,
-- que participa en una clave foránea con acción referencial.

-- Un contador por tipo de acceso (CAL-001…, CAF-001…).
INSERT IGNORE INTO `contador_control_acceso` (`tipoAcceso`, `ultimo`) VALUES ('LOGICO', 0), ('FISICO', 0);

-- Servidores: en GLPI son equipos (Computer) cuyo tipo de equipo es «Servidor Físico» o
-- «Servidor Virtual». Tienen categoría propia; INSERT IGNORE conserva una que ya exista.
INSERT IGNORE INTO `categoria` (`nombre`, `descripcion`) VALUES
  ('Servidores físicos', 'Tipo de activo de GLPI: Computer con tipo de equipo «Servidor Físico»'),
  ('Servidores virtuales', 'Tipo de activo de GLPI: Computer con tipo de equipo «Servidor Virtual»');

-- Elegibilidad inicial para Control de acceso (el admin la cambia en Catálogos).
-- Lógico: recursos que guardan o dan acceso a información.
UPDATE `categoria` SET `admiteAccesoLogico` = true
WHERE `nombre` IN ('Computadoras', 'Servidores físicos', 'Servidores virtuales', 'Programas',
                   'Aplicativos', 'Licencias', 'Certificados', 'Dispositivos de redes');
-- Físico: equipos tangibles a los que se pide acceder o retirar; no el software, las
-- licencias, los certificados ni los servidores virtuales, ni la infraestructura pasiva.
UPDATE `categoria` SET `admiteAccesoFisico` = true
WHERE `nombre` IN ('Computadoras', 'Servidores físicos', 'Dispositivos de redes', 'Racks', 'Gabinetes',
                   'Impresoras', 'Teléfonos', 'Periféricos', 'Monitores');

-- Los servidores ya importados de GLPI pasan de «Computadoras» a su categoría. Solo los que
-- siguen en «Computadoras» (una reclasificación manual se respeta) y con su historial.
INSERT INTO `bitacora_historial` (`activoId`, `accion`, `responsable`, `fecha`, `detalle`)
SELECT a.`id`, 'ACTUALIZAR', 'SISTEMA', NOW(3),
       JSON_OBJECT('categoriaId', JSON_OBJECT('antes', a.`categoriaId`, 'despues', destino.`id`))
FROM `activo` a
JOIN `categoria` actual ON actual.`id` = a.`categoriaId` AND actual.`nombre` = 'Computadoras'
JOIN `categoria` destino ON destino.`nombre` = CASE a.`tipo`
       WHEN 'Servidor Físico' THEN 'Servidores físicos'
       WHEN 'Servidor Virtual' THEN 'Servidores virtuales' END
WHERE a.`origenGlpi` LIKE 'Computer #%';

UPDATE `activo` a
JOIN `categoria` actual ON actual.`id` = a.`categoriaId` AND actual.`nombre` = 'Computadoras'
JOIN `categoria` destino ON destino.`nombre` = CASE a.`tipo`
       WHEN 'Servidor Físico' THEN 'Servidores físicos'
       WHEN 'Servidor Virtual' THEN 'Servidores virtuales' END
SET a.`categoriaId` = destino.`id`, a.`updatedAt` = NOW(3)
WHERE a.`origenGlpi` LIKE 'Computer #%';
