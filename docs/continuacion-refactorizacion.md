# Continuación: rama `feature/estandarizacion-y-renovaciones`

Estado al cierre del 28/10/2026, para retomar el trabajo sin repetir tareas.

## 0. Avance del 28/10/2026 y siguiente paso

**Commits nuevos** (subidos; la rama queda 18 commits por delante de `main`, sin fusionar):

| Commit | Contenido |
|---|---|
| `2d4f607` | refactor(ui): estandarización visual de tableros. Detección de Vulnerabilidades y Planificación de Renovaciones siguen la estructura de Planificación de Mantenimientos: cifras → 2 paneles → sección con su botón → filtros → tabla. Componentes compartidos `shared/components/Tablero.tsx` (`Cifra`, `PanelTablero`) y `EncabezadoSeccion.tsx`. Mantenimientos no cambió (comparación de capturas: 0 píxeles distintos) |
| `fb26722` | fix(web): reactividad de las fichas tras guardar, cerrar o fallar (invalidación en `onSettled`; formularios de cierre dentro del modal) y las dos opciones provisionales del menú |

**Verificado** con pruebas y en el navegador, contra la base de pruebas:

- **Web:** 122 pruebas superadas, compilación de producción correcta y solo los 2 avisos de lint de siempre.
- **Sondas sin fallos:**
  - reactividad (`p20`);
  - errores (`p20b`);
  - menú (`p21`);
  - los cuatro módulos (`p18`);
  - tableros (`p28`): las cifras coinciden con la API.
- **Backend:** sin ningún cambio.

**Reglas del usuario aprendidas:**

- «Unificar la interfaz» significa solo apariencia: la **estructura visual completa** de la pantalla de referencia, con los datos reales de cada módulo.
- Nunca se añaden fases, formularios ni campos que no se pidieron.
- Si un panel no tiene datos reales equivalentes, se explica; no se inventa.

**Siguiente tarea (29/10): Protección de Endpoints y Evaluación de Sistemas Productivos.** Hoy las dos son vistas provisionales: rutas `/proteccion-endpoints` y `/evaluacion-sistemas-productivos`, el componente `EnConstruccion` y el mensaje «Módulo en desarrollo - Próximamente disponible».

En el repositorio **no hay ninguna definición funcional** de estos módulos. Solo consta que el software ESET aparece en el inventario de GLPI.

Antes de crear modelos, migraciones o una API hay que **acordar con el usuario**:

1. **Los requisitos y campos** de cada módulo. Si se propone una fase de planificación, debe seguir el patrón visual de Mantenimientos.
2. **Si habrá fase de ejecución** con fecha real, verificable y repositorio, como en los demás módulos.
3. **A qué activos se aplica:** equipos de usuario, servidores o sistemas en producción.
4. **La arquitectura:** cada uno será un módulo NestJS independiente.

Los cambios de base de datos requieren autorización y el procedimiento habitual: respaldo verificado, prueba en `gestion_activos_test` y después desarrollo.

Lo marcado como **[VERIFICADO]** se comprobó en esta sesión con pruebas o consultas reales. Lo marcado como **[PENDIENTE]** todavía no se ha comprobado.

**Decisiones del usuario vigentes:**

- No fusionar con `main`.
- No aplicar la migración en desarrollo.
- No eliminar ni migrar los cuatro registros históricos de mantenimiento.

## 1. Objetivo

Aplicación de Gestión de Activos TI integrada con GLPI: inventario, respaldos, mantenimientos, vulnerabilidades, control de acceso y renovaciones.

Esta rama estandariza los módulos en **dos fases**, sin fase de verificación aparte: la evidencia se exige al cerrar. Además:

- añade Renovaciones con control de caducidad;
- unifica la presentación del cierre;
- añade un resumen de pendientes en la pantalla de inicio;
- retira los restos de la antigua fase de Verificación.

## 2. Git

| Dato | Valor |
|---|---|
| Rama | `feature/estandarizacion-y-renovaciones`, subida y sincronizada con `origin` **[VERIFICADO]** |
| Respecto a `main` (`e0bacb8`) | 0 commits por detrás. Delante: 15 hasta `9309458`; después vienen `bf37aa6` (este documento), `fb26722`, `2d4f607` y el commit de esta actualización **[VERIFICADO]** |
| Cambios locales que **no** son de esta rama | `GLPI-PRACTICA/DOCKER COMPOSE.yml`: en el índice como archivo vacío y con 33 líneas en el árbol de trabajo. Lo preparó el usuario. `gestion-activos-api/package-lock.json`: solo cambian los finales de línea. Ningún commit de la rama los incluye **[VERIFICADO]**. No commitearlos ni descartarlos. |

**Commits de la rama**, del más reciente al más antiguo:

| Commit | Contenido |
|---|---|
| `9309458` | docs: inventario y retiro de la antigua Verificación; tipos de la API |
| `fd0c80c` | refactor(api): retira la antigua Verificación (código + migración 20261027180000) |
| `4d0063a` | feat(web): pendientes por módulo en el inicio y documentación |
| `2245d05` | feat(api): `GET /api/dashboard/pendientes` |
| `8253a46` | refactor(web): bloque compartido de ejecución y cierre |
| `388bb8f`, `d682231` | Renovaciones (web y API) |
| `b5c221a`, `d92b2e7` | Vulnerabilidades en dos fases (web y API) |
| `8c23fc7`, `18b1f41`, `47b64f2`, `9d960f1` | Mantenimiento en dos fases, clase Hardware/Software |
| `79c7915`, `344cdb3` | Mejora de Control de acceso |

## 3. Mejoras completadas

| Mejora | Documento | Estado |
|---|---|---|
| Mantenimiento en dos fases | [mantenimiento.md](mantenimiento.md) | **[VERIFICADO]** pruebas y navegador |
| Vulnerabilidades en dos fases | [vulnerabilidades.md](vulnerabilidades.md) | **[VERIFICADO]** |
| Renovaciones con caducidad | [renovaciones.md](renovaciones.md) | **[VERIFICADO]**; migración `20261027120000` aplicada en desarrollo y en pruebas |
| Bloque compartido de cierre (`shared/cierre`) | [cierre-y-pendientes.md](cierre-y-pendientes.md) | **[VERIFICADO]** pruebas y navegador; no repetir |
| Pendientes del inicio (`/api/dashboard/pendientes`) | [cierre-y-pendientes.md](cierre-y-pendientes.md) | **[VERIFICADO]** contra la base de pruebas; no repetir. **[PENDIENTE]** probarlo en desarrollo |
| Retiro de la antigua Verificación | [verificacion-antigua.md](verificacion-antigua.md) | El código está retirado y probado **[VERIFICADO]**. La migración en desarrollo está **[PENDIENTE]** |

## 4. Pruebas

Resultados de la última ejecución, el 27/10/2026, después de retirar la Verificación. **[VERIFICADO]**

| Dónde | Resultado |
|---|---|
| API, pruebas unitarias (`npm test`) | 239 superadas |
| API, pruebas de extremo a extremo (`npm run test:e2e`; MySQL `gestion_activos_test` + Keycloak) | 289 superadas en 15 suites |
| API: compilación, `tsc` y lint | Sin errores; sin avisos en los archivos tocados |
| Web: `npm test` | 118 superadas |
| Web: compilación y lint | Compilación de producción correcta; los 2 avisos de lint ya existían (`RespaldosPage`, `MantenimientosPage`) |
| Navegador (API :3100 contra la base de pruebas) | `p18-cierre-compartido.mjs` y `p18b-corregir-mantenimiento.mjs`: todo correcto y sin errores de página |

**[PENDIENTE]** Nada de lo anterior se ha probado contra la base de **desarrollo** con el backend en :3000.

## 5. Migración pendiente

**Archivo:** `gestion-activos-api/prisma/migrations/20261027180000_retirar_verificacion_vulnerabilidades/migration.sql`

**Qué elimina.** Solo restos de **Vulnerabilidades**:

- las tablas `accion_remediacion` y `verificacion_vulnerabilidad`, con sus claves foráneas a `vulnerabilidad`;
- 10 columnas de `vulnerabilidad`: `confirmadaEn`, `confirmadaPor`, `prioridad`, `planRemediacion`, `evaluadaEn`, `evaluadaPor`, `fechaLimiteOriginal`, `tratamientoPrevisto`, `verificacionPrevista` y `verificacionLimite`.

**Qué no toca:**

- nada de mantenimiento: ni `verificacion_mantenimiento`, ni sus columnas, ni la `fechaLimiteOriginal` de mantenimiento;
- Verificable, Repositorio Verificable y `fuente`.

**Comprobación previa.** Antes de borrar, un `SELECT IF(... > 0, (SELECT 1 UNION ALL SELECT 2), 0)` cuenta:

- las filas de las dos tablas;
- las filas de `vulnerabilidad` con alguna de esas 10 columnas no nula.

Si el total es mayor que 0, MySQL lanza «Subquery returns more than 1 row» y la migración se detiene **antes** de borrar nada. Se comprobó en la base de pruebas, solo con lecturas, que el truco detiene con datos y deja pasar sin ellos. **[VERIFICADO]**

**Dónde se aplicó:**

| Base | Estado |
|---|---|
| `gestion_activos_test` | Aplicada. 19 migraciones y `migrate diff` vacío **[VERIFICADO]** |
| `gestion_activos_db` (desarrollo) | **NO aplicada**. `prisma migrate status` la lista como pendiente; las dos tablas siguen existiendo; la última aplicada es `20261027120000_renovaciones` **[VERIFICADO]**, por decisión del usuario |

**Datos que se perderían en desarrollo:** ninguno. El 27/10 las dos tablas tenían 0 filas y las 10 columnas, 0 valores en las 2 vulnerabilidades. **[VERIFICADO]** Hay que volver a contar justo antes de aplicarla.

**Riesgos que quedan por comprobar [PENDIENTE]:**

1. **Que sigan vacías** en desarrollo el día que se aplique. La salvaguarda lo cubre, pero hay que contarlo antes igualmente.
2. **Otros entornos.** Si `main` se despliega en otra base, por ejemplo producción, y allí hay datos, la migración se detendrá. Habría que decidir qué hacer con esos datos.
3. **MySQL no revierte un DDL** si falla a mitad de la migración. Por eso el respaldo verificado es obligatorio.
4. **Mientras no se aplique**, el código y la base de desarrollo están desalineados. Es inofensivo, porque el cliente de Prisma no lee lo eliminado, pero conviene comprobar en desarrollo que el backend arranca y que Vulnerabilidades funciona.

## 6. Histórico de la antigua Verificación de mantenimiento

**Dónde está.** Solo en la base de desarrollo (`gestion_activos_db`) y en sus respaldos `mysqldump`. **No** existen en la base de pruebas.

**Tabla `verificacion_mantenimiento`:** 4 filas, todas vigentes **[VERIFICADO, solo lectura]**. Los IDs **52, 53, 104 y 106 son los de los mantenimientos**; las verificaciones tienen IDs 1, 52, 53 y 54.

| Verificación | Mantenimiento | Fecha (UTC) | Resultado | Responsable | Fuera de plazo |
|---|---|---|---|---|---|
| 1 | 52 | 2026-10-17 03:07 | OPERATIVO | TIC | no |
| 52 | 53 | 2026-10-22 23:38 | OPERATIVO | Supervisor TIC | **sí** |
| 53 | 104 | 2026-10-22 23:43 | OPERATIVO | Supervisor Tic | no |
| 54 | 106 | 2026-10-23 00:18 | REQUIERE_SEGUIMIENTO | JAVIER PACHA | no |

Cada fila guarda estos campos:

- `fecha` y `resultado`;
- `observaciones`, `evidencia` y `responsable`;
- `registradoPor`, que en las cuatro es `admin.test`;
- `fueraDePlazo`, `motivoExcepcion` y `excepcionPor`;
- `version`, los campos de anulación, `createdAt` y `updatedAt`.

**Columnas de `mantenimiento`:** `verificacionPrevista` y `verificacionLimite` tienen valor en los mantenimientos 52 y 53. La traza `registro_cambio` 4, del mantenimiento 53, registra cuándo se programaron.

Los cuatro mantenimientos están en estado FINALIZADO y ninguno está anulado.

**Cómo consultarlos hoy:**

- **Verificaciones:** solo por SQL, porque se retiraron las rutas de la API y la web nunca las mostraba en dos fases. Por ejemplo, desde `gestion-activos-api` con `node --env-file=.env <script de solo lectura>` (el script `historico-mantenimiento.mjs` del scratchpad de la sesión) o con:
  ```sql
  SELECT * FROM verificacion_mantenimiento ORDER BY id;
  ```
- **Ventana de verificación:** la API la sigue devolviendo en `GET /api/mantenimientos/{id}` (`verificacionPrevista` y `verificacionLimite`, descritas como «Histórico»). La web no la muestra.
- **Traza:** `GET /api/trazas?entidad=MANTENIMIENTO&registroId=53`.

**Riesgo de perder el acceso.** Se inspeccionaron el código y el esquema **[VERIFICADO]**:

- **Ningún código de `src/` lee ni escribe** `verificacionMantenimiento`, así que nada borra esas filas. La limpieza de las pruebas sí la vacía (`test/utils/database.ts`), pero se niega a ejecutarse fuera de una base cuyo nombre termine en `_test`.
- **El modelo sigue en `schema.prisma`**, marcado como HISTÓRICO. **Riesgo:** si alguien lo borra del esquema o quita esas columnas, `prisma migrate diff` generaría un `DROP TABLE` o `DROP COLUMN` y se perderían los datos. Cualquier cambio en esas líneas exige antes una decisión sobre los datos.
- **Clave foránea** `verificacion_mantenimiento → mantenimiento` con `ON DELETE RESTRICT`: protege a los mantenimientos de un borrado físico. La aplicación solo hace anulación lógica.
- **Acceso por la API:** ya no hay endpoint para las verificaciones. Si se quiere verlas en la aplicación sin tocar los datos, habría que añadir una consulta de solo lectura (decisión pendiente).

**Opciones**, detalladas en [verificacion-antigua.md](verificacion-antigua.md):

- **A.** Conservar tal cual (estado actual).
- **B.** Copiar cada verificación a una traza del mantenimiento y después borrar.
- **C.** Exportar a CSV y borrar.

**Pendiente de decisión del usuario.**

## 7. Comprobaciones para la próxima sesión

### Solo lectura (se pueden ejecutar sin riesgo)

```bash
cd "C:/Users/adminqt/Documents/GESTION DE ACTIVOS"
git status -sb
git rev-list --count origin/main..HEAD          # esperado: 16 (15 + este documento)
git log --oneline origin/main..HEAD -- "GLPI-PRACTICA/DOCKER COMPOSE.yml" gestion-activos-api/package-lock.json   # esperado: vacío

cd gestion-activos-api
npx prisma migrate status                       # esperado: 20261027180000 pendiente
npm test                                        # 239
npm run test:e2e                                # 289 (usa SOLO gestion_activos_test)
cd ../gestion-activos-web && npm test && npm run build
```

Revisión en desarrollo, sin escribir datos:

1. Backend en :3000 (contenedor `gestion-activos-backend`) y web con `npm run dev` en :5173.
2. Entrar como `admin.test`. Las cuatro tarjetas del inicio deben mostrar «N pendientes» y coincidir con `GET http://localhost:3000/api/dashboard/pendientes` (Swagger: http://localhost:3000/api/docs).
3. Entrar como `auditor.test`: debe ver las insignias y no tener botones de guardar, cerrar ni reabrir.
4. Abrir sin modificar las fichas de un registro de cada módulo y los mantenimientos 52, 53, 104 y 106.
5. Consola del navegador (F12) sin errores nuevos.
6. Al terminar, liberar los puertos 5173 y 3100 si se usaron servidores de prueba.

### Modifica datos: NO ejecutar sin autorización expresa

```powershell
# Aplicar la migración en desarrollo (procedimiento completo en verificacion-antigua.md):
#   1. mysqldump → C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-retirar-verificacion-<fecha>.sql
#   2. Restaurar en verif_respaldo_tmp, comparar conteos y hacer DROP de la temporal.
docker pause gestion-activos-glpi-sync
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # debe salir vacío
docker unpause gestion-activos-glpi-sync
```

Las pruebas manuales que cierran, reabren o corrigen registros (las del informe anterior) **escriben en la base de desarrollo**. Hacerlas solo con registros de prueba o con autorización.

**Fusión con `main`:** la hace el usuario, solo con confirmación expresa, después de aplicar la migración y pasar las comprobaciones.

## 8. Decisiones pendientes

1. Aplicar la migración `20261027180000` en desarrollo.
2. Qué hacer con los 4 registros históricos de mantenimiento: A, B o C.
3. Fusionar la rama con `main`.
4. Pendientes anteriores: criticidades reales, tarjetas SIM, canal de correo para avisos, Fase 4 (dashboard completo) y Fase 5 (producción).
