-- CreateTable
CREATE TABLE `categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `criticidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nivel` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `sistemas` VARCHAR(191) NOT NULL,
    `custodio` VARCHAR(191) NOT NULL,
    `ubicacion` VARCHAR(191) NOT NULL,
    `cifrado` BOOLEAN NOT NULL,
    `ultimaRevision` DATETIME(3) NOT NULL,
    `categoriaId` INTEGER NOT NULL,
    `criticidadId` INTEGER NOT NULL,

    UNIQUE INDEX `activo_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bitacora_historial` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `accion` VARCHAR(191) NOT NULL,
    `responsable` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `detalle` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `respaldo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `alcanceDetalle` VARCHAR(191) NOT NULL,
    `estadoEjecucion` VARCHAR(191) NOT NULL,
    `fechaEjecucion` DATETIME(3) NOT NULL,
    `rutaEvidencia` VARCHAR(191) NOT NULL,
    `estadoPrueba` VARCHAR(191) NOT NULL,
    `resultadoPrueba` VARCHAR(191) NOT NULL,
    `fechaPrueba` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mantenimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `fase` VARCHAR(191) NOT NULL,
    `estadoEquipo` VARCHAR(191) NOT NULL,
    `actividad` VARCHAR(191) NOT NULL,
    `resultado` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vulnerabilidad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activoId` INTEGER NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `nivelRiesgo` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL,
    `mitigacion` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activo` ADD CONSTRAINT `activo_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activo` ADD CONSTRAINT `activo_criticidadId_fkey` FOREIGN KEY (`criticidadId`) REFERENCES `criticidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bitacora_historial` ADD CONSTRAINT `bitacora_historial_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `respaldo` ADD CONSTRAINT `respaldo_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mantenimiento` ADD CONSTRAINT `mantenimiento_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vulnerabilidad` ADD CONSTRAINT `vulnerabilidad_activoId_fkey` FOREIGN KEY (`activoId`) REFERENCES `activo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
