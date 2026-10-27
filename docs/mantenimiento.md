# Mantenimiento: planificación, ejecución y bitácoras

Este documento es la referencia del módulo de mantenimiento:

- cómo se separa lo **planificado** de lo **ejecutado**;
- cómo se calculan año y semestre;
- qué situaciones atraviesa una ejecución;
- cómo se audita;
- cómo se obtienen la **Bitácora General** y la **Bitácora Específica**.

Norma de referencia: ISO/IEC 27001:2022, A.7.13 *Mantenimiento de los equipos*.

## 1. Estructura

```
Activo (GLPI) 1 ── N Planificación (plan_mantenimiento) 1 ── N Ejecución (mantenimiento)
```

- **Activo.** Es el activo real que trae la sincronización con GLPI (`activo`). El módulo no crea activos ni los duplica.
- **Planificación** (`plan_mantenimiento`). Es lo que se **planifica**: activo, tipo, período, fecha de inicio planificada, asignado, descripción planificada y plazo de cada intervención.
- **Ejecución** (`mantenimiento`, con `planId`). Es cada intervención **realizada o por realizar** de una planificación.
  - Guarda las fechas reales, la persona encargada, la descripción de lo ejecutado, la condición del equipo, el verificable y su repositorio.
  - Una planificación tiene **N** ejecuciones: la del período, ejecuciones adicionales, reprogramaciones o intervenciones parciales.
- **Solo dos fases.** No hay fase de verificación: completar una ejecución, en una sola petición con su fecha real de finalización, verificable, repositorio y observación, la deja cerrada. La interfaz no muestra la antigua capa 3 y la agenda de mantenimientos no devuelve eventos de verificación.
  - Los endpoints de la antigua verificación (`/mantenimientos/:id/verificaciones`, `/verificaciones/:id/anular`, `/verificacion-prevista`, el filtro `cierre`, el campo `cierre` y el plazo `VERIFICACION`) se **retiraron** de la API.
  - La tabla `verificacion_mantenimiento` y las columnas `verificacionPrevista` y `verificacionLimite` se **conservan** en la base, sin código que las use, porque guardan verificaciones reales registradas antes del cambio (4 en desarrollo). Qué hacer con esos datos está pendiente de decisión. Detalle en [verificacion-antigua.md](verificacion-antigua.md).

Se evolucionó el módulo existente en lugar de crear tablas paralelas. `plan_mantenimiento → mantenimiento` ya era 1→N, con clave foránea real.

### Reglas

- **Toda ejecución nueva nace de una planificación vigente.**
  - `POST /api/mantenimientos` exige `planId`.
  - El activo, el tipo y la descripción prevista se copian de la planificación.
  - Si se envía un `activoId` distinto del de la planificación → 400.
  - La ejecución **no se puede reasignar** a otra planificación ni a otro activo.
- **Registros anteriores.** Las 2 ejecuciones de desarrollo sin planificación se conservan.
  - Se muestran como «sin planificación (registro anterior)».
  - La Bitácora General las cuenta aparte, en la columna «sin planificación».
- **Activo dado de baja o en la papelera de GLPI.**
  - No admite planificaciones ni ejecuciones nuevas (400 con el motivo).
  - Su historial se conserva y se sigue consultando.
  - La sincronización con GLPI **no borra** planificaciones ni ejecuciones: solo marca el activo como inactivo.

## 2. Tabla de campos

Fuentes:

- **Excel**: `Bitácoras.xlsx`, hoja «Mantenimiento Sistemas».
- **Requisito**: el enunciado del módulo.
- **Existente**: el esquema anterior.

| Campo original | Fase | Fuente | Campo definitivo | Acción | Justificación |
|---|---|---|---|---|---|
| Sistema / Sistema GRPI | Planificación | Excel | `plan_mantenimiento.activoId` → `activo` | Reutilizado | Es el activo de GLPI (códigos AC-00xx); no se guarda texto libre |
| Frecuencia | Planificación | Existente | `frecuencia` (UI: **Período**) | Renombrado en la UI | Período = cada cuánto se repite (Única, Mensual, Trimestral, Semestral, Anual); no es un estado |
| — | Planificación | Requisito | `fechaInicio` (fecha de inicio planificada) | **Nuevo** | Fija; de ella se derivan año y semestre planificados |
| Próxima fecha | Planificación | Existente | `proximaFecha` | Conservado | Avanza con cada ejecución del período |
| Semestre | Planificación | Requisito | *(calculado)* `semestrePlanificado` | Derivado, no se guarda | S1 = ene–jun, S2 = jul–dic, de `fechaInicio` en hora de Guayaquil |
| Tipo | Ambas | Requisito | `tipo` (6 valores) | Ampliado | Hardware: preventivo, correctivo, predictivo · Software: preventivo, correctivo, perfectivo, adaptativo, evolutivo |
| — | Catálogo | Requisito | `categoria.claseMantenimiento` | **Nuevo** | Decide los tipos válidos; se elige en Catálogos, no se infiere del nombre del activo |
| Responsable | Planificación | Excel | `plan.responsable` (UI: **Asignado**) | Renombrado en la UI | Quién debe hacerlo |
| Actividad | Planificación | Excel | `plan.actividades` (UI: **Descripción planificada**) | Renombrado en la UI | Lo previsto |
| — | Ejecución | Existente | `mantenimiento.fecha` / `fechaLimite` | Conservado | Intervalo previsto de esa ejecución |
| Fecha Inicio Mantenimiento | Ejecución | Excel | `mantenimiento.fechaInicio` (**fecha real**) | Ahora obligatoria al iniciar | La indica el usuario; nunca la hora del servidor |
| Fecha Fin | Ejecución | Excel | `mantenimiento.fechaFin` (**fecha real**) | Ahora obligatoria al completar | Ídem; no futura, no anterior al inicio |
| — | Ejecución | Requisito | `createdAt` (**fecha de registro**) | Conservado | Automática; distinta de las fechas reales |
| Responsable (de la ejecución) | Ejecución | Excel | `tecnico` (UI: **Persona encargada**) | Renombrado en la UI | Quién lo hizo |
| Descripción | Ejecución | Excel | `resultado` (UI: **Descripción de la ejecución**) | Renombrado en la UI | Lo realmente hecho; en un cancelado guarda el motivo |
| Estado (Operativo / Requiere cambio) | Ejecución | Excel | `estadoEquipo` (UI: **Condición del equipo**) | Conservado | Es la condición del equipo, no la situación del trabajo |
| Observación | Ejecución | Excel | `observaciones` | Conservado | |
| Verificable | Ejecución | Excel | `evidencia` (UI: **Verificable**) | Renombrado en la UI | Nombre del informe o acta |
| Repositorio Verificable | Ejecución | Excel | `repositorioVerificable` | **Nuevo** | Carpeta compartida o URL; solo http/https si es URL |
| Estado de ejecución | Ejecución | Requisito | `fase` (UI: **Situación**) | Etiquetas nuevas | Pendiente, En ejecución, Completado, Cancelado (enum interno sin cambios) |
| — | Ejecución | Requisito | `fechaCancelacion` | **Nuevo** | La cancelación ya no ocupa `fechaFin` (el trabajo no terminó) |
| Diagnóstico, duración, costo, repuestos | Ejecución | Existente | Iguales | Conservados | Ya exigidos al completar |
| Fecha Planificada, Fecha Ejecutada Renovación | — | Excel (Matriz de Renovación) | — | **Fuera de alcance** | Decisión del usuario: la renovación no forma parte de este módulo |

### Clase del activo en la interfaz

- Al planificar se elige **primero el activo**. Cada fila del selector y la planificación muestran su clase según la categoría: **Hardware · físico**, **Software · lógico** o **Sin clasificar**. Es la misma lógica de marcas por categoría que en Control de acceso: la decide el admin en Catálogos.
- El selector **Tipo de mantenimiento** está deshabilitado hasta elegir un activo y luego ofrece **solo** los tipos de su clase.
- Una planificación agrupa activos de **una sola clase**: los de otra clase no se pueden marcar.
- La API valida lo mismo por su cuenta (400 «no corresponde a hardware/software»), así que la regla no depende de la interfaz.
- La clase también se muestra en la tabla de planificaciones, en «Nueva ejecución» y en el detalle de la ejecución.

## 3. Año y semestre

- El **semestre planificado** se deriva de `plan_mantenimiento.fechaInicio`; el **semestre real**, de `mantenimiento.fechaInicio`. Ninguno se almacena.
- Ambos se calculan en hora de **America/Guayaquil** (`zonaHoraria()`: `ZONA_HORARIA` o `GLPI_TIMEZONE`, por defecto Guayaquil): el 30 de junio a las 22:00 en Guayaquil es el 1 de julio a las 03:00 UTC, y sigue siendo **S1**.
- Código: `src/maintenance/planificacion.ts`.
  - `semestreDe(fecha)` → `{ anio, semestre, etiqueta: 'S1-2026' }`.
  - `rangoDe(anio, semestre?)` → instantes de medianoche de Guayaquil para filtrar en la base.
- Una ejecución planificada en junio y realizada en julio **sigue siendo del S1 planificado** en la Bitácora General. Su ejecución completada cuenta en el **S2 real**.

## 4. Situación de la ejecución

| Situación (UI) | Enum (`fase`) | Desde | Acción | Datos exigidos |
|---|---|---|---|---|
| Pendiente | `PROGRAMADO` | — | Nueva ejecución | Planificación vigente, inicio previsto |
| En ejecución | `EN_EJECUCION` | Pendiente | Iniciar | **Fecha real de mantenimiento** (no futura); fuera del intervalo previsto, excepción de admin |
| Completado | `FINALIZADO` | En ejecución | Completar | **Fecha real de finalización**, descripción, condición, encargado, diagnóstico y duración; repositorio válido |
| Cancelado | `CANCELADO` | Pendiente o En ejecución | Cancelar | **Motivo**; se registra `fechaCancelacion` |

Otras reglas de las transiciones:

- Cualquier otra transición devuelve **409**.
- La **condición del equipo** (`estadoEquipo`) es otro campo: no se mezcla con la situación.
- **Corregir lo ejecutado** (`PATCH /api/mantenimientos/:id/ejecucion`) exige motivo y valida el tipo por clase y las fechas.
  - En ejecución: admin y analista.
  - Completada: solo admin (403 para los demás).
  - Pendiente o cancelada: 409.

## 5. Auditoría y conservación

Se reutiliza el mecanismo común (`TrazasService`, tabla `registro_cambio`).

- **Iniciar, completar, cancelar, editar lo previsto y corregir lo ejecutado** usan `trazas.modificar`. Antes, iniciar, completar y cancelar no dejaban traza.
  - El cambio y la traza van **en la misma transacción**.
  - La traza guarda campo a campo el antes y el después, el motivo y el **usuario de la sesión**.
  - La actualización es condicional por versión y situación: si otra petición se adelantó → 409, sin traza y sin subir la versión. Lo cubre una prueba e2e.
- Las planificaciones se modifican, suspenden, anulan y revierten con motivo y traza.
- **No hay borrado físico.** Anular es lógico: el registro se conserva y deja de contar en indicadores y bitácoras.

## 6. Bitácoras

Las dos son de solo lectura y las consultan los tres roles, incluido el auditor. Los registros **anulados** no cuentan.

### Bitácora General: `GET /api/mantenimientos/bitacora/general?anio=2026[&semestre=1|2]`

Por cada semestre del año, y su total:

| Columna | Definición |
|---|---|
| `planificadas` | Planificaciones no anuladas cuyo **semestre planificado** es este |
| `cumplidas` | De ellas, las que tienen **al menos una** ejecución completada (finalizada, no anulada), en cualquier fecha. Un `Set` de `planId`: varias ejecuciones de una planificación cuentan **una vez** |
| `suspendidas` | Suspendidas **sin** ejecución completada: no son exigibles |
| `esperadas` | `planificadas − suspendidas` |
| `pendientes` | `esperadas − cumplidas` |
| `cumplimiento` | `cumplidas / esperadas × 100`, con 1 decimal; `null` si `esperadas = 0` (no hay división por cero) |
| `ejecucionesCompletadas` | Ejecuciones completadas cuyo **semestre real** es este, con o sin planificación |
| `ejecucionesSinPlanificacion` | De ellas, las que no tienen planificación (registros anteriores) |

Código:

- Cálculo puro en `src/maintenance/bitacora/calculo.ts`, con pruebas en `calculo.spec.ts`.
- Consultas en `bitacora-mantenimiento.service.ts`.

### Bitácora Específica: `GET /api/mantenimientos/bitacora/especifica`

Parámetros: `anio`, `semestre` (exige el año), `activoId`, `tipo`, `responsable`, `situacion`, `page` y `limit` (máximo 100).

**Filas**

- Una por ejecución, con las columnas de su planificación.
- Una más por cada planificación que todavía no tiene ejecuciones, con situación `SIN_EJECUCION`.

**Filtros**

- Año y semestre son los **planificados**. En ejecuciones sin planificación se usa el inicio previsto.
- `responsable` busca en el asignado y en la persona encargada.
- `situacion=PROGRAMADO` (Pendiente) incluye también las planificaciones sin ejecución.

**Orden y paginación**

- Orden: fecha planificada descendente; después, inicio previsto e identificador.
- Paginación estable: primero se obtienen las claves mínimas, luego se ordenan y paginan, y al final se carga el detalle de la página.

## 7. Endpoints

| Método y ruta | Roles | Cambio |
|---|---|---|
| `POST /api/mantenimientos/planes` | admin, analista | Exige `fechaInicio`; valida el tipo por clase de cada activo |
| `GET /api/mantenimientos/planes?anio&semestre` | todos | Nuevos filtros; respuesta con `semestrePlanificado` y `ejecucionesCompletadas` |
| `PATCH /api/mantenimientos/planes/:id` | admin, analista | Valida el tipo por clase |
| `POST /api/mantenimientos/planes/:id/programar` | admin, analista | Cuerpo opcional `{ fecha?, adicional? }`; la adicional no mueve la próxima fecha |
| `POST /api/mantenimientos` | admin, analista | Ahora `{ planId, activoId?, fecha, fechaLimite? }` |
| `PATCH /api/mantenimientos/:id/iniciar` | admin, analista | `fechaInicio` obligatoria; con traza |
| `PATCH /api/mantenimientos/:id/finalizar` | admin, analista | `fechaFin` obligatoria; `repositorioVerificable`; con traza |
| `PATCH /api/mantenimientos/:id/cancelar` | admin, analista | `fechaCancelacion`; con traza |
| `PATCH /api/mantenimientos/:id/ejecucion` | admin, analista (completada: admin) | **Nuevo**: corrección de lo ejecutado |
| `GET /api/mantenimientos/bitacora/general` | todos | **Nuevo** |
| `GET /api/mantenimientos/bitacora/especifica` | todos | **Nuevo** |
| `PATCH /api/categorias/:id` | admin | `claseMantenimiento` |

## 8. Migración

Migración `prisma/migrations/20261022120000_mantenimiento_planificacion_ejecucion`. Es **incremental**: no borra tablas, columnas ni registros.

1. Amplía el enum `tipo` en `plan_mantenimiento` y `mantenimiento`.
2. Añade `categoria.claseMantenimiento` y clasifica las categorías por su tipo de GLPI: físicas → HARDWARE; programas, licencias, certificados y aplicativos → SOFTWARE. Información, Red y Servicio quedan sin clasificar, a decisión del admin.
3. Añade `plan_mantenimiento.fechaInicio`, la rellena con `COALESCE(proximaFecha, createdAt)` y la vuelve obligatoria.
4. Añade `mantenimiento.repositorioVerificable` y `fechaCancelacion`. Las cancelaciones anteriores copian su `fechaFin` y la conservan.

## 9. Comandos

Desde `gestion-activos-api`:

```bash
npx prisma migrate deploy                                  # aplica migraciones (DATABASE_URL del .env)
npx prisma generate                                        # genera el cliente en src/generated
npm run build && npm run start:dev                         # backend (o el contenedor gestion-activos-backend)
npm test                                                   # unitarias (vitest)
npm run test:e2e                                           # e2e: aplica migraciones a gestion_activos_test y la vacía
npm run lint
```

Desde `gestion-activos-web`:

```bash
npm run api:generate   # regenera src/api/schema.d.ts desde http://localhost:3000/api/docs-json
npm run dev            # Vite en :5173
npm test && npm run build && npm run lint
```

Antes de migrar desarrollo: respaldo con `mysqldump`, restauración verificada en una base temporal y comparación de conteos. Ver [conexion-mysql.md](conexion-mysql.md).

## 10. Limitaciones y decisiones pendientes

- **Clase de las categorías.** Las categorías nuevas que traiga GLPI llegan sin clase: solo admiten preventivo y correctivo hasta que el admin las clasifique en Catálogos.
- **Volumen de la Bitácora Específica.** Ordena las claves en memoria. Con cientos o pocos miles de filas por año es adecuado; si crece mucho, conviene una vista SQL con `UNION` y paginación en la base.
- **Matriz de Renovación** del Excel: fuera de alcance.
- **Notas manuscritas** mencionadas en el requisito: no se encontraron en el equipo, así que no se usaron.
