# Homologación de Protección de Endpoints y Evaluación de Sistemas (06/11/2026)

**Estado:** implementado, probado y **migración aplicada en desarrollo el 06/11** con autorización expresa (sección 6). **Sin commitear.**

## 1. Decisiones del usuario (06/11)

| Pregunta | Decisión |
|---|---|
| Modelo de Endpoints | **C: control mensual con detalle por equipo.** Un período por mes (único año-mes) con una línea por equipo real; los totales se calculan de las líneas. |
| Fecha planificada en Endpoints | **Columna nueva** `fechaPlanificada`. Año y mes se derivan de ella y se siguen guardando porque sostienen el índice único. |
| Fecha planificada en Evaluación | **Es la misma** `fechaProgramadaProduccion`; solo cambia la etiqueta. Sin columna nueva. |
| Responsable de la ejecución en Evaluación | **Columna nueva**, obligatoria al cerrar. |

**Ratificada (06/11), tras revisar la alternativa consolidada (A):** se mantiene C. Límite conocido: vincular un activo no demuestra que tenga antivirus. La marca de cada equipo la registra una persona y la prueba sigue siendo el verificable (el Excel de la consola del antivirus). No hay integración con la consola ni con GLPI que informe el antivirus por equipo; si se incorpora, sería la fuente de esas marcas.

## 2. Modelo anterior y nuevo

**Protección de Endpoints:**

- **Antes:** un período mensual sin activos. El total y los equipos con antivirus se escribían a mano.
- **Ahora:**
  - **Apertura:** el período nace de la **fecha planificada**. Año, mes y semestre se derivan en la hora de Ecuador: el 1 a las 21:00 UTC−5 sigue siendo del mes anterior.
  - **Equipos del período:** al abrirlo se copian los **activos operativos de categorías con `aplicaEndpoint`** a la tabla nueva `periodo_endpoint_activo`.
  - **Registro y totales:** cada línea registra si el equipo tiene antivirus. El total, los equipos con y sin antivirus y la cobertura se calculan de las líneas y se guardan en las columnas existentes. Así el panel, la agenda y los períodos anteriores siguen funcionando igual.
  - **Cierre:** exige registrar todos los equipos; el mensaje dice cuáles faltan.
  - **Auditoría:** cada cambio de un equipo queda como «Equipo PC-01: Con antivirus → Sin antivirus», también cuando los totales no cambian.
  - **Historial:** si un activo se da de baja, sale de GLPI o cambia de categoría, su línea se conserva (`onDelete: Restrict`). Los períodos nuevos ya no lo incluyen.
  - **Períodos anteriores al detalle** (como el **#1** y el **#52** de desarrollo): conservan sus totales escritos a mano. Uno pendiente puede «Cargar los equipos sujetos a control» una sola vez, y queda en la auditoría. No se inventa ninguna relación para los ya cerrados.
- **Duplicados:** otro día del mismo mes da 409. Dos aperturas simultáneas: el índice único rechaza la segunda (P2002 → 409); está probado.

**Evaluación de Sistemas Productivos:**

- **Lo que ya estaba:** activo real obligatorio (`exigirOperativo(…, 'EVALUACION')` en el backend), fecha planificada, una pendiente por sistema y otra posible tras el cierre, fecha real manual, justificación del retraso, y evidencia y repositorio obligatorios.
- **Añadido:**
  - `responsableEjecucion`, obligatorio al cerrar. La evaluación #1, cerrada, se conserva sin él.
  - Mes y semestre visibles.
  - Pestaña **2 · Ejecución y cierre**.
  - Filtro por categoría.
  - Detalle de consulta en la Bitácora.

## 3. Cambios

**API:**

- **Endpoints:**
  - `POST /proteccion-endpoints/periodos` recibe `fechaPlanificada` (ya no `anio` ni `mes`).
  - `GET` y `POST /proteccion-endpoints/periodos/:id/equipos`.
  - `PATCH …/registro` y `…/cerrar` aceptan `equipos: [{ activoId, conAntivirus }]`. Con detalle, rechazan los totales escritos a mano.
  - Filtros `activo` y `categoriaId`.
  - Campos nuevos en la respuesta: `fechaPlanificada`, `semestre`, `conDetalle`, `equiposSinRegistrar` y `porEjecutar`.
- **Evaluación:** `responsableEjecucion` y el filtro `categoriaId`.
- **Auditoría:** `TrazasService.modificar` acepta cambios adicionales que no son columnas, como las líneas de detalle.
- **Calendario:** estado nuevo **`POR_EJECUTAR`**, solo para Endpoints y Evaluación: abierto, sin empezar, con la fecha planificada pasada.
  - Un registro en progreso sigue «En curso» y uno cerrado sale «Completado».
  - El evento de Evaluación lleva el código, el nombre y la categoría del sistema.
  - El de Endpoints dice cuántos equipos tiene y de qué categorías.
- **Panel:** `endpoints.porEjecutar` y `evaluaciones.proximas30Dias`.

**Web:**

- **Endpoints:**
  - **Apertura:** se elige una fecha en el calendario y se ve el período calculado (Mes, Año y Semestre).
  - **Ficha:** lista de equipos reales (código, nombre, categoría y tipo), con «Con» o «Sin» antivirus, búsqueda, el filtro «solo sin registrar» y «Marcar los N sin registrar con antivirus». Los totales son calculados.
  - **Tablas:** filtros por equipo y por categoría (solo las de Endpoints), fecha planificada y la marca «Por ejecutar».
  - **Consulta:** el detalle de solo lectura muestra la lista de equipos.
- **Evaluación:**
  - Tres pestañas, con la pestaña en la URL.
  - Planificación: fecha planificada con el período calculado.
  - Ficha: responsable de la ejecución y confirmación de cierre.
  - Bitácora: categoría, verificable y repositorio, con «Ver detalle», que incluye historial y fecha de cierre.
- **Selector de activos (común):** muestra también el tipo.
- **Avisos falsos retirados:** ninguno de los dos modales dice ya que la fase 2 está «aún no disponible».
- **Corrección encontrada en el navegador:** tras «Guardar avance», la ficha se volvía a montar con la lista de equipos de la caché; las marcas aparecían vacías y una acción en bloque podía pisarlas. Ahora espera la lista recién leída.

## 4. Migración `20261106120000_endpoints_detalle_y_evaluacion_responsable`

Solo añade; no borra ni modifica datos:

- `periodo_endpoint.fechaPlanificada` (admite vacío);
- la tabla `periodo_endpoint_activo`, con FK `Restrict` a período y activo y único (período, activo);
- `evaluacion_sistema.responsableEjecucion` (admite vacío).

| Base | Estado |
|---|---|
| `gestion_activos_test` | Aplicada; `migrate diff` sale vacío |
| `gestion_activos_db` | **Aplicada el 06/11** (sección 6) |

**Efecto en desarrollo al aplicarla:**

- los períodos #1 y #52 y la evaluación #1 no cambian (quedan sin fecha planificada, sin detalle y sin responsable de la ejecución);
- el #52 (Noviembre 2026, ABIERTO) podrá cargar sus equipos desde la ficha si se desea.

## 5. Pruebas

- **API:** unitarias de `endpoint-protection` y `production-evaluation`. Suite e2e nueva `homologacion-endpoints-evaluacion.e2e-spec.ts`, que cubre:
  - elegibilidad y período derivado sin desfase UTC;
  - duplicados, también simultáneos;
  - totales calculados y la auditoría de cada equipo;
  - cierre, reapertura e historial tras la baja de un activo;
  - períodos anteriores al detalle;
  - filtros, «por ejecutar» en la agenda y el panel;
  - el responsable de la ejecución y la nueva evaluación tras un cierre.
- **Suites existentes:** se adaptó el contrato de apertura (fecha en lugar de año y mes). En el cierre de Evaluación se añadió el responsable de la ejecución. El estado del abierto vencido pasó de `VENCIDO` a `POR_EJECUTAR`, y la comprobación del panel ahora incluye `porEjecutar`.
- **Web:** `shared/periodo.test.ts`, `evaluacion-sistemas/textos.test.ts` y ampliaciones de `proteccion-endpoints/textos.test.ts` y del panel.
- **Navegador** (base de pruebas, `nav/p40-homologacion.mjs`): 34 de 34.

## 6. Validación integral (06/11/2026)

### Migración en desarrollo (autorizada)

- **Respaldo:** `C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-endpoints-detalle-20261106-160746.sql`, tomado con los servicios en pausa. 1 169 732 bytes, «Dump completed», SHA-256 `aa108e5c6f306cd326e0c113919cf20a854a94e829c769f763425613ab87e3e2`. Restaurado en una copia: 22 de 22 tablas idénticas.
- **Ensayo en la copia:** la migración se aplica y `diff` sale vacío. Cambian solo `_prisma_migrations` y las dos tablas con columna nueva; sus columnas anteriores son idénticas fila a fila. Siguen los 460 activos de GLPI y las 23 categorías. Las FK nuevas son RESTRICT.
- **Aplicación:** `migrate deploy`, «schema up to date» y `diff` vacío. Mismas comprobaciones de datos que en el ensayo. Todas las rutas responden 200.

### Cambio añadido: aviso de diferencias con el inventario

La ficha de un período con detalle compara su lista (copiada al abrirlo) con los equipos elegibles de hoy: los que entraron después y los que dejaron de ser elegibles. Solo informa; el período no cambia su lista ni su total. Usa la ruta `GET /proteccion-endpoints/periodos/:id/comparacion-inventario` y tiene su prueba e2e (computadora nueva a mitad de mes).

### Registros de prueba creados en DESARROLLO (identificados «PRUEBA VALIDACIÓN 06-11»)

- Período **#103, Febrero 2021**, CERRADO: 26 equipos y cobertura 96,2 %. Se usó un mes de 2021 para no ocupar un mes real.
- Evaluación **#52** de VM-CONTABILIDAD, CERRADA (tardía, justificada).
- Evaluación **#53** de VM-CONTABILIDAD, **pendiente** (planificada en diciembre de 2026).
- No hay API para borrarlos.

### Resultados

| Prueba | Resultado |
|---|---|
| Endpoints y Evaluación en desarrollo (navegador, `nav/p41`) | 52 de 56; los 4 fallos eran de la sonda (mayúsculas, navegación con recarga y una expectativa de fechas), comprobados aparte |
| Calendario en desarrollo (`nav/p43`) | 8 de 8 |
| Regresión de los 11 apartados en desarrollo, 3 perfiles, solo lectura (`nav/p42`) | 88 de 89; el fallo era un evento oculto tras «+N más», comprobado en la vista diaria |
| Base de pruebas (`nav/p40`, `nav/p36`) | 36 de 36 y correctas |
| GLPI | Servicio activo cada 15 minutos; solo lee de GLPI (su único POST es el del token); marca, no borra; sin cambios en activos, categorías ni historial durante las pruebas |
