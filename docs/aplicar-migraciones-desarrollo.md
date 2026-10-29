# Aplicar las cuatro migraciones pendientes en desarrollo

**Estado: EJECUTADO el 29/10/2026 (14:26–14:35, hora de Guayaquil) con la autorización expresa del usuario.** Resultado en la sección 5.

Antes de aplicarlas, el backend de desarrollo (contenedor con recarga en caliente sobre el código actual) respondía 500 en:

- `GET /api/categorias` y `GET /api/activos`, porque faltaba `categoria.aplica*`;
- las dos pantallas nuevas y el panel de pendientes, porque faltaban `periodo_endpoint` y `evaluacion_sistema`.

## 1. Revisión de las migraciones

### Orden, sumas y estado

Se aplican en este orden, que es el de su nombre. `prisma migrate deploy` las aplica en orden y se detiene en la primera que falle.

| # | Migración | sha256 del archivo | Pruebas (`gestion_activos_test`) | Desarrollo (`gestion_activos_db`) |
|---|---|---|---|---|
| 1 | `20261027180000_retirar_verificacion_vulnerabilidades` | `148e9af241a633c5fae96a033a708c0fb09e52eaa3898e0f7dbc7243b3d11d8d` | Aplicada el 28/10; **suma idéntica** | Pendiente |
| 2 | `20261029120000_categorias_aplicacion_modulos` | `7c8b037d8e4eba32a0563208e87a2f849165972b2465600012f4e41950cca4e2` | Aplicada el 29/10; **suma idéntica** (versión v1, no se modifica) | Pendiente |
| 3 | `20261029150000_proteccion_endpoints` | `e0617a3ef8f37411bcdc0f7f2ae4a54761a1d8e2cf17862d2a431df6a612c644` | Aplicada el 29/10; **suma idéntica** | Pendiente |
| 4 | `20261029151000_evaluacion_sistemas` | `c8c03606d40f2e62d40aab350ea8a2df59a002c5f3c808a09cd73ba45853d378` | Aplicada el 29/10; **suma idéntica** | Pendiente |

Los cuatro archivos tienen finales de línea LF.

**Comprobación** (solo lectura): `npx prisma migrate status` en desarrollo encuentra 22 migraciones y lista estas cuatro como no aplicadas. En pruebas dice «Database schema is up to date!».

**Anomalías anteriores, ajenas a estas cuatro** (no bloquean `migrate deploy`, que no compara sumas):

- **Desarrollo:** `20260930170925_init` se registró el 30/09 con la suma `37611f7a1322…`, y el archivo actual da `6db64d23a17b…`. El archivo se ajustó después de aplicarse en esa base. **Consecuencia:** no hay que usar `prisma migrate dev` contra `gestion_activos_db`, porque ofrecería reiniciar la base. Se usa siempre `migrate deploy`.
- **Pruebas:** `20261020120000_control_acceso` tiene un intento fallido del 20/10, marcado como revertido, y una aplicación correcta posterior con la suma actual. Está resuelto.

### Dependencias

- **1** solo toca `vulnerabilidad`, `accion_remediacion` y `verificacion_vulnerabilidad`.
- **2** solo añade columnas a `categoria`. Su salvaguarda **lee** `activo`, `plan_mantenimiento`, `mantenimiento`, `vulnerabilidad` y `renovacion`: usa `vulnerabilidad.activoId`, que la 1 no toca.
- **3** no depende de nada.
- **4** crea una clave foránea a `activo(id)`, que existe desde la migración inicial.
- **El código actual** (`schema.prisma` y el cliente generado) corresponde al estado **tras las cuatro**. Aplicar solo algunas deja el backend de desarrollo con errores, así que se aplican juntas.

### Qué hace cada una

1. **`retirar_verificacion_vulnerabilidades`**
   - **Borra:**
     - las tablas `accion_remediacion` y `verificacion_vulnerabilidad`;
     - 10 columnas antiguas de `vulnerabilidad` (`confirmadaEn`, `confirmadaPor`, `prioridad`, `planRemediacion`, `evaluadaEn`, `evaluadaPor`, `fechaLimiteOriginal`, `tratamientoPrevisto`, `verificacionPrevista`, `verificacionLimite`).
   - **Salvaguarda:** antes de borrar, un `SELECT` se detiene con error si hay algún dato en lo que se borra.
   - **Conserva los datos históricos de mantenimiento:**
     - la tabla `verificacion_mantenimiento`, con 4 filas en desarrollo;
     - las columnas `mantenimiento.verificacionPrevista` y `verificacionLimite`, con 2 mantenimientos con valor;
     - los campos Verificable y Repositorio Verificable del flujo vigente.
   - Ver [verificacion-antigua.md](verificacion-antigua.md).
2. **`categorias_aplicacion_modulos`**
   - **Añade** 5 columnas `BOOLEAN NOT NULL DEFAULT false` a `categoria`.
   - **Fija** la matriz v1 por nombre y aplica una salvaguarda por uso.
   - **No borra nada.**
   - Ver [categorias-aplicacion.md](categorias-aplicacion.md).
3. **`proteccion_endpoints`**
   - **Crea** la tabla `periodo_endpoint`, con un índice único `(anio, mes)` y un índice por `estado`.
   - **No toca ninguna tabla existente.**
4. **`evaluacion_sistemas`**
   - **Crea** la tabla `evaluacion_sistema`, con índices `(activoId, estado)` y `(fechaProgramadaProduccion)`, y la clave foránea `activoId → activo(id)` (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`).
   - **No toca ninguna tabla existente.**

### Precondiciones comprobadas en desarrollo (29/10, solo lectura)

| Comprobación | Resultado |
|---|---|
| Salvaguarda de la migración 1 (datos en lo que se borra) | **0**: no se detendrá |
| Claves foráneas que borra la 1 | Las 2 existen |
| Columnas de `vulnerabilidad` que borra la 1 | Existen las 10 |
| `accion_remediacion` / `verificacion_vulnerabilidad` | 0 filas / 0 filas |
| Columnas `categoria.aplica*` ya existentes | 0: la 2 no chocará |
| Tablas `periodo_endpoint` / `evaluacion_sistema` ya existentes | 0: la 3 y la 4 no chocarán |
| Motor y colación de `activo` (para la clave foránea) | InnoDB, `utf8mb4_unicode_ci`, igual que la tabla nueva |
| Migraciones fallidas sin resolver | Ninguna |

**Conteos de referencia** (29/10), para comparar después:

| Tabla | Filas |
|---|---|
| `activo` | 460 |
| `categoria` | 23 |
| `mantenimiento` | 8 |
| `plan_mantenimiento` | 2 |
| `verificacion_mantenimiento` | 4 |
| `vulnerabilidad` | 2 |
| `renovacion` | 1 |
| `control_acceso` | 3 |
| `registro_cambio` | 24 |
| `notificacion` | 465 |
| `_prisma_migrations` | 18 |

Hay que **volver a tomarlos el día de la aplicación**: glpi-sync y el uso los cambian.

## 2. Procedimiento

En **Git Bash**, para que `>` y `<` copien los bytes tal cual. En PowerShell 5.1, `>` y `Get-Content` pueden cambiar la codificación del respaldo.

Las credenciales salen del contenedor (`$MYSQL_ROOT_PASSWORD`) o del `.env` y **no se imprimen**.

```bash
cd "/c/Users/adminqt/Documents/GESTION DE ACTIVOS/gestion-activos-api"
FECHA=$(date +%Y%m%d-%H%M%S)
RESPALDO="C:/Users/adminqt/gestion-activos-respaldos/gestion_activos_db-antes-endpoints-evaluacion-$FECHA.sql"
TABLAS="_prisma_migrations accion_remediacion activo bitacora_historial categoria contador_control_acceso control_acceso criticidad ejecucion_respaldo historial_control_acceso mantenimiento notificacion plan_mantenimiento plan_respaldo registro_cambio renovacion respaldo restauracion sincronizacion verificacion_mantenimiento verificacion_vulnerabilidad vulnerabilidad"
```

**Paso 0. Comprobar que el punto de partida no ha cambiado.**

```bash
npx prisma migrate status    # deben salir exactamente las 4 pendientes
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SHOW DATABASES LIKE \"verif_%\""'   # debe salir vacío
```

**Paso 1. Detener lo que escribe en la base.**

```bash
docker pause gestion-activos-glpi-sync
docker pause gestion-activos-backend     # evita escrituras de usuarios durante el respaldo y la migración
```

**Paso 2. Respaldo.**

```bash
docker exec servidor-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --set-gtid-purged=OFF --databases gestion_activos_db' > "$RESPALDO"
ls -l "$RESPALDO"; tail -1 "$RESPALDO"     # ~1,1 MB; la última línea debe ser «-- Dump completed on …»
```

**Paso 3. Prueba de restauración en una base temporal.**

```bash
sed -E 's/`gestion_activos_db`/`verif_respaldo_tmp`/g' "$RESPALDO" | docker exec -i servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
L=$(for t in $TABLAS; do printf 'gestion_activos_db.%s, verif_respaldo_tmp.%s, ' "$t" "$t"; done); L=${L%, }
docker exec servidor-mysql sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'CHECKSUM TABLE $L'"
```

`CHECKSUM TABLE` compara el **contenido** de cada tabla, no solo su número de filas. Cada par debe dar el mismo valor. Si alguno difiere, el respaldo no vale: se detiene aquí (ver «Si algo falla»).

**Paso 4. Ensayo de las 4 migraciones sobre la copia temporal** (recomendado; no toca desarrollo).

```bash
node --env-file=.env -e "const u=new URL(process.env.DATABASE_URL); u.pathname='/verif_respaldo_tmp'; const env={...process.env, DATABASE_URL:u.toString()}; const x=require('child_process').execSync; x('npx prisma migrate deploy',{stdio:'inherit',env}); x('npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script',{stdio:'inherit',env})"
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT COUNT(*) verificaciones_mant FROM verif_respaldo_tmp.verificacion_mantenimiento; SELECT nombre, aplicaMantenimiento M, aplicaVulnerabilidad V, aplicaRenovacion R, aplicaEvaluacion E, aplicaEndpoint P FROM verif_respaldo_tmp.categoria ORDER BY nombre; SELECT COUNT(*) FROM verif_respaldo_tmp.periodo_endpoint; SELECT COUNT(*) FROM verif_respaldo_tmp.evaluacion_sistema;"'
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE verif_respaldo_tmp"'
```

Resultado esperado:

- se aplican 4 migraciones;
- el `diff` sale **vacío**;
- 4 verificaciones de mantenimiento;
- las banderas según la v1;
- las dos tablas nuevas a 0.

El `DROP` solo afecta a la base temporal.

**Paso 5. Aplicar en desarrollo.**

```bash
npx prisma migrate deploy
```

**Paso 6. Comprobar el esquema.**

```bash
npx prisma migrate status                                                                    # «Database schema is up to date!»
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # debe salir vacío
```

**Paso 7. Comprobar los datos** (solo lectura).

```bash
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" gestion_activos_db -e "
SELECT (SELECT COUNT(*) FROM activo) activo, (SELECT COUNT(*) FROM categoria) categoria, (SELECT COUNT(*) FROM mantenimiento) mant,
       (SELECT COUNT(*) FROM plan_mantenimiento) planes, (SELECT COUNT(*) FROM verificacion_mantenimiento) verif_mant,
       (SELECT COUNT(*) FROM vulnerabilidad) vuln, (SELECT COUNT(*) FROM renovacion) renov, (SELECT COUNT(*) FROM control_acceso) accesos,
       (SELECT COUNT(*) FROM registro_cambio) trazas, (SELECT COUNT(*) FROM _prisma_migrations) migraciones;
SELECT COUNT(*) mant_con_verificacion FROM mantenimiento WHERE verificacionPrevista IS NOT NULL OR verificacionLimite IS NOT NULL;
SELECT nombre, aplicaMantenimiento M, aplicaVulnerabilidad V, aplicaRenovacion R, aplicaEvaluacion E, aplicaEndpoint P FROM categoria ORDER BY nombre;
SELECT (SELECT COUNT(*) FROM periodo_endpoint) periodos, (SELECT COUNT(*) FROM evaluacion_sistema) evaluaciones;"'
```

Resultado esperado:

- los mismos conteos que antes del paso 2, salvo `_prisma_migrations`, que suma 4;
- `verif_mant` = 4 y `mant_con_verificacion` = 2;
- las banderas según la v1;
- Computadoras y Dispositivos de redes con M; Servidores virtuales con V y R, por la salvaguarda;
- las dos tablas nuevas a 0.

**Paso 8. Reanudar.**

```bash
docker unpause gestion-activos-backend
docker unpause gestion-activos-glpi-sync
```

**Paso 9. Pruebas posteriores.**

1. **API de desarrollo** (http://localhost:3000, con sesión): deben responder 200
   - `GET /api/categorias`, `GET /api/activos`, `GET /api/activos/categorias?aplica=ENDPOINT`;
   - `GET /api/proteccion-endpoints/periodos`, `GET /api/evaluaciones-sistemas`, `GET /api/dashboard/pendientes`.
2. **Navegador:**
   - Inventario y Catálogos (los 5 interruptores);
   - los selectores de Mantenimientos, Vulnerabilidades y Renovaciones (solo las categorías habilitadas);
   - las pantallas `/proteccion-endpoints` y `/evaluacion-sistemas-productivos`, y las insignias del inicio.
3. **glpi-sync:** `docker logs --tail 50 gestion-activos-glpi-sync` tras su siguiente ciclo, sin errores. Las banderas de Catálogos no deben cambiar con la sincronización.
4. **Suites automáticas** (solo usan `gestion_activos_test`):
   - `npx vitest run`;
   - `npx vitest run --config vitest.config.e2e.ts`;
   - en la web, `npx vitest run`.

**Paso 10. Matriz.** Las decisiones pendientes de [categorias-aplicacion.md](categorias-aplicacion.md#valores-pendientes-de-decisión) se aplican después, desde Catálogos > Categorías. **Ojo:** la edición de categorías (`PATCH /api/categorias/:id`) **no** deja traza en `registro_cambio`; el antes y el después se anotan aquí. No se editan migraciones aplicadas.

## 3. Si algo falla

- **Antes del paso 5:** desarrollo no ha cambiado.
  1. Borrar la temporal si existe: `docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS verif_respaldo_tmp"'`.
  2. Reanudar con el paso 8.
- **Durante el paso 5:**
  1. `npx prisma migrate status` dice qué migraciones quedaron aplicadas y cuál falló.
  2. Las anteriores a la fallida están completas.
  3. Según la que falló:

| Falló | Estado probable | Recuperación |
|---|---|---|
| 1, en la salvaguarda | **Nada cambió** (el `SELECT` va antes de cualquier `DROP`) | Hay datos nuevos en lo que se iba a borrar. `npx prisma migrate resolve --rolled-back 20261027180000_retirar_verificacion_vulnerabilidades`, se revisan esos datos con el usuario y no se continúa |
| 1, después | Parcial: alguna FK, columna o tabla ya borrada (vacías, sin pérdida) | Completar a mano las sentencias que faltan del `migration.sql` y `npx prisma migrate resolve --applied 20261027180000_retirar_verificacion_vulnerabilidades`. Después, `npx prisma migrate deploy` para las siguientes |
| 2 | Columnas creadas y algunos `UPDATE` sin aplicar | Repetir solo los `UPDATE` (son idempotentes) y `npx prisma migrate resolve --applied 20261029120000_categorias_aplicacion_modulos`. Ver [categorias-aplicacion.md](categorias-aplicacion.md) |
| 3 | `CREATE TABLE` es atómico: la tabla no existe | `npx prisma migrate resolve --rolled-back 20261029150000_proteccion_endpoints`, corregir la causa y `npx prisma migrate deploy` |
| 4, en la FK | La tabla `evaluacion_sistema` existe, vacía, sin FK | `DROP TABLE evaluacion_sistema` (vacía, recién creada), `npx prisma migrate resolve --rolled-back 20261029151000_evaluacion_sistemas`, corregir la causa y `npx prisma migrate deploy` |

**Restaurar el respaldo** solo como último recurso. **Requiere otra autorización expresa**, porque reemplaza la base de desarrollo y se pierde lo escrito después del respaldo.

Hay que borrar antes la base: el respaldo no contiene las tablas nuevas y, si se dejan, el siguiente `deploy` chocaría.

```bash
docker pause gestion-activos-glpi-sync; docker pause gestion-activos-backend
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE gestion_activos_db"'
docker exec -i servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < "$RESPALDO"
npx prisma migrate status     # deben volver a salir las 4 pendientes
docker unpause gestion-activos-backend; docker unpause gestion-activos-glpi-sync
```

## 4. Riesgos

- **El backend de desarrollo sigue con errores hasta el paso 5.** No es una pérdida de datos: es el código nuevo leyendo un esquema antiguo.
- **Ventana sin servicio** entre los pasos 1 y 8, con el backend y glpi-sync pausados. Son unos minutos.
- **La matriz v1** deja habilitados tres valores aún sin decidir (ver [categorias-aplicacion.md](categorias-aplicacion.md)). Afectan a qué activos ofrecen los selectores, no a los datos.
- **No usar `prisma migrate dev`** contra desarrollo, por la suma antigua de `init`.

## 5. Resultado de la ejecución (29/10/2026)

| Paso | Resultado |
|---|---|
| 0 | Las 4 pendientes, como se esperaba; sin bases temporales previas |
| 1 | `gestion-activos-glpi-sync` y `gestion-activos-backend` en pausa |
| 2 | Respaldo `C:Usersadminqtgestion-activos-respaldosgestion_activos_db-antes-endpoints-evaluacion-20261029-142647.sql` (1 144 203 bytes, «Dump completed»). Salvaguarda = 0. Conteos iguales a los de la tabla de la sección 1 |
| 3 | Restaurado en `verif_respaldo_tmp`: **22 tablas comparadas con `CHECKSUM TABLE`, 0 distintas** |
| 4 | Ensayo en la copia: 4 migraciones aplicadas, `diff` vacío, 4 verificaciones de mantenimiento, banderas según la v1, tablas nuevas a 0 y 460 activos. Copia temporal borrada |
| 5 | `migrate deploy` en desarrollo: **4 migraciones aplicadas** |
| 6 | `migrate status`: «Database schema is up to date!»; `diff`: vacío |
| 7 | Conteos idénticos (`_prisma_migrations` 18 → 22); `verificacion_mantenimiento` 4; 2 mantenimientos con fechas de verificación; `periodo_endpoint` y `evaluacion_sistema` a 0 |
| 8 | Contenedores reanudados |
| 9 | GET de auditor en :3000, **todos 200**: categorías, activos, selectores, los 4 módulos, `/api/dashboard/pendientes` y las dos rutas nuevas. Sin errores en el backend; el frontend responde. Reanudado a las 19:29:03 UTC (`docker events`). Su primer ciclo posterior (19:30 UTC) terminó **sin errores**: 0 «con error» en todos los tipos, 0 cambios, punto de control avanzado e informe `glpi-sync-2026-10-29T19-30-00-014Z-aplicado.json` |
| 10 | Decisiones del usuario aplicadas por la API de Catálogos como `admin.test` (sin traza en `registro_cambio`; ver tabla siguiente) |

**Cambios de la matriz aplicados** (29/10/2026, por decisión del usuario):

| Categoría | Bandera | Antes | Después |
|---|---|---|---|
| Programas | Renovaciones (`aplicaRenovacion`) | Sí | **No** |
| Servidores físicos | Protección de endpoints (`aplicaEndpoint`) | Sí | **No** |
| Servidores virtuales | Protección de endpoints (`aplicaEndpoint`) | Sí | **No** |

Las otras 20 categorías no cambiaron. Activos operativos elegibles después:

- **Protección de Endpoints:** 26, las Computadoras.
- **Renovaciones:** 29.
- **Evaluación:** **0**, porque «Aplicativos» está vacía en GLPI.

**Habilitación provisional** (29/10/2026, 14:41, por decisión del usuario, para las pruebas de interfaz): **Servidores virtuales → Evaluación = Sí** (antes No). Elegible: VM-CONTABILIDAD (GLPI-PC-29). Las otras 22 categorías no cambiaron. Lo definitivo será registrar los sistemas de negocio como *Appliance* en GLPI («Aplicativos») y documentarlo en el manual de usuario; entonces se decidirá si se apaga esta bandera.
