-- Diagnóstico de la sincronización con GLPI. SOLO LECTURA: ninguna consulta
-- modifica datos. Tablas y columnas reales del esquema (prisma/schema.prisma).
--
--   docker exec -it servidor-mysql mysql -u USUARIO -p gestion_activos_db
--
-- La referencia de GLPI se guarda en activo.origenGlpi con el formato
-- "<Tipo> #<id>", por ejemplo "Computer #12" o "NetworkEquipment #1".

-- 0. Vista general: cada activo con su código, su referencia y sus datos principales.
SELECT id, codigo, origenGlpi, numeroInventario, codigoInstitucional,
       tipo, fabricante, modelo, numeroSerie, estado
FROM activo
ORDER BY id;

-- 1. Referencias de GLPI duplicadas. Debe devolver CERO filas
--    (lo impide el índice único activo_origenGlpi_key).
SELECT origenGlpi, COUNT(*) AS veces
FROM activo
WHERE origenGlpi IS NOT NULL
GROUP BY origenGlpi
HAVING COUNT(*) > 1;

-- 2. Códigos operativos repetidos. Debe devolver CERO filas
--    (lo impide el índice único activo_codigo_key).
SELECT codigo, COUNT(*) AS veces
FROM activo
GROUP BY codigo
HAVING COUNT(*) > 1;

-- 3. Números de inventario repetidos. Es NORMAL que haya filas: el n.º de
--    inventario de GLPI no es único. Sirve para saber cuáles corregir en GLPI.
SELECT numeroInventario, COUNT(*) AS veces,
       GROUP_CONCAT(codigo ORDER BY id SEPARATOR ', ') AS activos
FROM activo
WHERE numeroInventario IS NOT NULL AND numeroInventario <> ''
GROUP BY numeroInventario
HAVING COUNT(*) > 1
ORDER BY veces DESC;

-- 4. Activos sincronizados sin referencia válida. Debe devolver CERO filas:
--    todo lo que firma GLPI en el historial debe tener origenGlpi bien formado.
SELECT a.id, a.codigo, a.origenGlpi
FROM activo a
WHERE (a.origenGlpi IS NOT NULL
       AND a.origenGlpi NOT REGEXP '^(Computer|NetworkEquipment|Software) #[1-9][0-9]*$')
   OR (a.origenGlpi IS NULL
       AND EXISTS (SELECT 1 FROM bitacora_historial b
                   WHERE b.activoId = a.id AND b.responsable = 'GLPI' AND b.accion = 'CREAR'));

-- 5. Activos registrados a mano, pendientes de vincular (sin referencia de GLPI).
SELECT id, codigo, numeroInventario, codigoInstitucional, nombre, custodio
FROM activo
WHERE origenGlpi IS NULL AND deletedAt IS NULL
ORDER BY id;

-- 6. Códigos institucionales que requieren revisión.
-- 6a. Repetidos entre varios activos.
SELECT codigoInstitucional, COUNT(*) AS veces,
       GROUP_CONCAT(CONCAT(codigo, ' [', COALESCE(origenGlpi, 'manual'), ']')
                    ORDER BY id SEPARATOR ', ') AS activos
FROM activo
WHERE codigoInstitucional IS NOT NULL AND codigoInstitucional <> ''
GROUP BY codigoInstitucional
HAVING COUNT(*) > 1;

-- 6b. Con formato irregular (no son cuatro grupos numéricos "7-1-22-177").
SELECT id, codigo, origenGlpi, codigoInstitucional
FROM activo
WHERE codigoInstitucional IS NOT NULL
  AND codigoInstitucional NOT REGEXP '^[0-9]+(-[0-9]+){3}$'
ORDER BY id;

-- 6c. Sincronizados sin código institucional (el comentario de GLPI no lo trae o dice "S/N").
SELECT id, codigo, origenGlpi, nombre
FROM activo
WHERE origenGlpi IS NOT NULL
  AND (codigoInstitucional IS NULL OR codigoInstitucional = '')
ORDER BY id;

-- 6d. Activos que quedaron con el código de respaldo (candidatos a recibir un código definitivo).
SELECT id, codigo, origenGlpi, numeroInventario, codigoInstitucional, nombre
FROM activo
WHERE codigo LIKE 'GLPI-%'
ORDER BY id;

-- 7. Historial firmado por GLPI, por tipo de acción.
SELECT accion, COUNT(*) AS entradas
FROM bitacora_historial
WHERE responsable = 'GLPI'
GROUP BY accion;

-- 8. INTEGRIDAD: registros que apuntan a un activo que ya no existe.
--    Debe devolver CERO filas. Si no, NO importes hasta resolverlo: los
--    activos nuevos reutilizarían esos ids y heredarían estos registros.
SELECT 'respaldo' AS tabla, r.id, r.activoId
FROM respaldo r LEFT JOIN activo a ON a.id = r.activoId WHERE a.id IS NULL
UNION ALL
SELECT 'mantenimiento', m.id, m.activoId
FROM mantenimiento m LEFT JOIN activo a ON a.id = m.activoId WHERE a.id IS NULL
UNION ALL
SELECT 'vulnerabilidad', v.id, v.activoId
FROM vulnerabilidad v LEFT JOIN activo a ON a.id = v.activoId WHERE a.id IS NULL
UNION ALL
SELECT 'bitacora_historial', b.id, b.activoId
FROM bitacora_historial b LEFT JOIN activo a ON a.id = b.activoId WHERE a.id IS NULL;

-- 9. Últimas ejecuciones de la sincronización: modo, resultado y punto de control.
--    puntoControl solo se rellena si la ejecución terminó sin errores.
--    enCurso = 1 indica una ejecución escribiendo ahora (o un bloqueo abandonado).
SELECT id, origen, modo, estado, solicitadaPor, inicio, fin,
       TIMESTAMPDIFF(MICROSECOND, inicio, fin) / 1000 AS ms,
       puntoControl, leidos, creados, actualizados, inactivados, reactivados,
       detectados, aplicados, errores, enCurso
FROM sincronizacion
ORDER BY id DESC
LIMIT 20;

-- 10. Equipos No activos y por qué (baja manual, papelera de GLPI o ya inexistentes allí),
--     con los registros que conservan.
SELECT a.id, a.codigo, a.nombre, a.origenGlpi,
       CASE WHEN a.deletedAt IS NOT NULL THEN 'BAJA_MANUAL' ELSE a.motivoInactivo END AS motivo,
       COALESCE(a.deletedAt, a.inactivoDesde) AS desde,
       (SELECT COUNT(*) FROM respaldo r WHERE r.activoId = a.id) AS respaldos,
       (SELECT COUNT(*) FROM mantenimiento m WHERE m.activoId = a.id) AS mantenimientos,
       (SELECT COUNT(*) FROM vulnerabilidad v WHERE v.activoId = a.id) AS vulnerabilidades,
       (SELECT COUNT(*) FROM bitacora_historial b WHERE b.activoId = a.id) AS historial
FROM activo a
WHERE a.deletedAt IS NOT NULL OR a.inactivoDesde IS NOT NULL
ORDER BY desde DESC;

-- 11. Avisos generados por la sincronización, por tipo y estado de lectura.
SELECT tipo, leida, COUNT(*) AS avisos, MAX(fecha) AS ultimo
FROM notificacion
GROUP BY tipo, leida
ORDER BY tipo, leida;
