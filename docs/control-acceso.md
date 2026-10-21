# Control de acceso

Solicitudes de acceso **lógico** (sistemas, información) y **físico** (equipos, salas). Sigue un flujo de atención y cada cambio queda auditado.

Cada solicitud es de uno de dos tipos. En formularios, tablas, detalle e insignias se muestran así:

- **ALTA · Otorgamiento de acceso** (`ACCESO`): concede el acceso a una persona.
- **BAJA · Desvinculación de acceso** (`BAJA`): se lo retira.

Ninguna de las dos modifica el activo ni lo retira de GLPI.

El módulo forma parte de la misma aplicación:

- **Base de datos:** la misma (MySQL, Prisma).
- **Autenticación:** Keycloak, con los roles de siempre.
- **Inventario:** se apoya en el modelo `Activo` y en las categorías que vienen de GLPI.

Normas ISO/IEC 27001:2022 de referencia: A.5.15 Control de acceso, A.5.18 Derechos de acceso y A.7.2 Entrada física.

## Modelo de datos

Una sola tabla principal para los dos tipos, con `tipoAcceso` como discriminador. La creó la migración `20261020120000_control_acceso`; la de `20261021120000_mejora_control_acceso` añadió el solicitante y retiró la fecha deseada.

**`control_acceso`**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | INT autoincremental | Clave primaria |
| `codigoUnico` | VARCHAR(20), **único** | `CAL-001` (lógico) o `CAF-001` (físico); lo genera el backend |
| `tipoAcceso` | ENUM `LOGICO`, `FISICO` | |
| `activoId` | INT, opcional | Clave foránea a `activo` (`ON DELETE RESTRICT`) |
| `recurso` | VARCHAR(191), opcional | Recurso no inventariado (correo institucional, sala de servidores…) |
| `fechaSolicitud` | DATETIME | Cuándo se pidió; no futura |
| `nombreSolicitante`, `cargoSolicitante` | VARCHAR(191), opcional en la base | **Quién solicita o autoriza** el trámite. Obligatorios al registrar una solicitud nueva; `NULL` en las anteriores al 2026-10-21 (no se inventan) |
| `nombreUsuarioBeneficiario`, `departamento` | VARCHAR(191) | **Quién recibe (ALTA) o pierde (BAJA)** el acceso |
| `tipoSolicitud` | ENUM `ACCESO`, `BAJA` | ALTA · Otorgamiento / BAJA · Desvinculación |
| `descripcion` | TEXT | Motivo (mínimo 10 caracteres) |
| `estado` | ENUM `ABIERTO`, `PENDIENTE`, `CERRADO` | `ABIERTO` al crear (lo pone el backend) |
| `resolucion` | TEXT, opcional | Qué se hizo; obligatoria al cerrar |
| `fechaCreacion` | DATETIME | Registro en el sistema: automática, **no editable** e independiente de la fecha atendida |
| `fechaAtendido` | DATETIME, opcional | Fecha y hora **reales** de la atención. La indica quien cierra; es obligatoria al cerrar y puede ser **histórica**, anterior al registro. No puede ser futura ni anterior a la solicitud. `NULL` mientras no está cerrada |

`fechaAccesoDeseada` **se retiró** el 2026-10-21; ver «Migración» para cómo se conservaron sus valores.

**Activo o recurso, nunca ninguno ni los dos.**

- **Con un activo:** debe existir, estar vigente y operativo (la misma regla de los demás módulos) y su categoría debe admitir el tipo de acceso.
- **Sin activo:** se exige `recurso`. Nunca se crean activos ficticios ni se escribe en GLPI.
- **Dónde se valida:** en el backend. MySQL no admite un `CHECK` sobre `activoId` porque esa columna participa en una clave foránea con acción referencial.

El activo no se copia en la solicitud: su código, nombre y categoría se leen por la relación.

**`historial_control_acceso`** (auditoría): `id`, `controlAccesoId`, `campo`, `valorAnterior`, `valorNuevo`, `usuario`, `fecha`, `motivo`.

**`contador_control_acceso`**: `tipoAcceso` (clave primaria) y `ultimo`, el último correlativo emitido.

**Categorías:** `categoria.admiteAccesoLogico` y `categoria.admiteAccesoFisico` (BOOLEAN, falso por defecto).

## Activos elegibles

| Tipo | Regla (en el servidor, con Prisma) |
|---|---|
| Lógico | Activo vigente y operativo cuya **categoría** tiene *Acceso lógico* |
| Físico | Activo vigente y operativo cuya **categoría** tiene *Acceso físico* |

- **No hay un campo «contiene información» por activo.** `sistemas` lo rellena GLPI con el sistema operativo o el modelo, y `cifrado` indica si está cifrado, no si guarda datos. Por eso la regla es **por categoría**.
- **Quién la decide:** el admin, en **Catálogos › Categorías** (interruptores *Acceso lógico* y *Acceso físico*).
- **Dónde se guarda:** en nuestra base. La sincronización con GLPI no la toca.
- **Endpoints:**
  - `GET /api/control-acceso/activos-elegibles?tipoAcceso=LOGICO&q=&categoriaId=&page=&limit=`: paginado; busca por código o nombre.
  - `GET /api/control-acceso/categorias-elegibles?tipoAcceso=…`: las categorías con activos elegibles y su número.

**Clasificación inicial** (la aplica la migración; el admin la cambia):

| Categoría | Lógico | Físico | Por qué |
|---|---|---|---|
| Computadoras | Sí | Sí | Guardan información; equipos tangibles |
| Servidores físicos | Sí | Sí | Ídem |
| Servidores virtuales | Sí | **No** | Guardan información; no hay equipo al que entrar |
| Dispositivos de redes | Sí | Sí | Configuración y tráfico; equipos tangibles |
| Programas, Aplicativos, Licencias, Certificados | Sí | No | Recursos lógicos (tipos no físicos de GLPI) |
| Monitores, Periféricos, Teléfonos, Impresoras, Racks, Gabinetes | No | Sí | Equipos tangibles que no guardan información del negocio |
| Cables, Tomas de red, Multitomas, Dispositivos pasivos | No | No | Infraestructura pasiva |

Las categorías antiguas del seed sin activos (Hardware, Información, Red, Servicio, Software) quedan sin marcar.

## Servidores físicos y virtuales

En GLPI son `Computer` con tipo de equipo «Servidor Físico» o «Servidor Virtual».

- **Categorías propias:** el inventario los coloca en *Servidores físicos* y *Servidores virtuales*.
- **Sin duplicados:** la identidad sigue siendo `origenGlpi` (`Computer #28`, `Computer #29`).
- **En desarrollo:** `HP-520` y `VM-CONTABILIDAD` se reclasificaron con su entrada en la bitácora.

Detalle en [glpi-sync.md](glpi-sync.md#tipos-de-activo-de-glpi).

## Códigos

Hay un correlativo **independiente por tipo**: `CAL-001`, `CAL-002`… y `CAF-001`, `CAF-002`… Se usan al menos tres cifras y nunca se trunca (`CAL-1000`). No existía otra numeración persistente en el proyecto (los folios PLN/RES de respaldos se calculan del id solo para mostrarlos).

**Generación segura ante altas simultáneas.**

1. Dentro de la transacción del alta, el backend incrementa el contador con un `UPDATE … SET ultimo = ultimo + 1` (un `upsert` de Prisma) y usa el valor resultante.
2. El bloqueo de fila de InnoDB **serializa** las altas simultáneas. No se usa `count() + 1` ni ningún contador en memoria.
3. `codigoUnico` tiene un índice **único**. Si aun así chocara (por ejemplo, un contador alterado a mano), la transacción se revierte y se reintenta con el siguiente número, hasta 3 veces.
4. La transacción espera hasta 15 s una conexión libre (por defecto Prisma solo espera 2 s). Comprobado con 20 altas simultáneas.

Cambiar el tipo de acceso de una solicitud (solo en `ABIERTO`) le asigna un código de la otra serie. Los dos cambios quedan en el historial.

## Estados y transiciones

| Acción | Desde | Hacia | Quién | Requisito |
|---|---|---|---|---|
| Registrar | — | `ABIERTO` | admin, analista | El cliente no puede enviar estado, código, fechas de atención ni usuario (400) |
| Pasar a pendiente | `ABIERTO` | `PENDIENTE` | admin, analista | |
| Cerrar | `ABIERTO` o `PENDIENTE` | `CERRADO` | admin, analista | Resolución (≥10) y **`fechaAtendido` válida** (obligatoria; puede ser histórica; no futura ni anterior a la solicitud). El backend **no** la sustituye por la hora actual |
| Reabrir | `CERRADO` | `PENDIENTE` | **solo admin** | Motivo (≥20). Quita la fecha atendida y la resolución; la atención anterior se conserva (ver abajo) |
| Modificar | `ABIERTO` o `PENDIENTE` | — | admin, analista | Sin fecha atendida ni resolución (400); el tipo de acceso, solo en `ABIERTO` |
| Corregir una cerrada | `CERRADO` | — | **solo admin** (analista: 403) | Motivo (≥20). Admite corregir la fecha atendida y la resolución, con las mismas validaciones; el tipo de acceso no cambia (409) |

- Cualquier otra transición devuelve **409**.
- **Bajas:** una `BAJA` sigue el mismo flujo; al cerrarla, la resolución describe cómo se **retiró** el acceso. No da de baja el activo.
- **Reapertura sin perder información.** Al reabrir, la fecha atendida y la resolución vigentes pasan al historial como «valor anterior», con el usuario, la fecha y el motivo de la reapertura. El detalle las muestra en «Atenciones anteriores». Si la solicitud se vuelve a cerrar, la nueva atención no pisa la anterior.
- **Elegibilidad al corregir.** Solo se revalida si cambian el activo o el tipo de acceso. Así se puede corregir una solicitud antigua aunque su activo se haya dado de baja después.
- **Sin fecha deseada, ya no hay «situación»** (programada, próxima o vencida).

### Aislamiento del estado de la solicitud y del activo

El **estado de la solicitud** (`control_acceso.estado`: Abierto, Pendiente, Cerrado) y el **estado del activo** son datos distintos que no se cruzan. El del activo incluye la condición física de GLPI (`activo.estado`: Bueno, Regular, Malo…) y la baja (`deletedAt` / `inactivoDesde`).

- **Columnas distintas en tablas distintas.** `control_acceso.estado` es un `ENUM`; `activo.estado` es texto que escribe la sincronización con GLPI.
- **El módulo solo lee el inventario.** `access-control` hace `findUnique`, `count`, `findMany` y `groupBy` sobre `activo`, y ningún `create`, `update`, `upsert` ni `delete`. Tampoco escribe en la bitácora del activo.
- **Una sola relación.** Es la clave foránea `control_acceso.activoId → activo.id`, con `ON DELETE RESTRICT` (un activo con solicitudes no se puede borrar físicamente; los activos nunca se borran, se dan de baja). Su `ON UPDATE CASCADE` solo actualizaría la solicitud si cambiara el *id* del activo, nunca al revés.
- **Sin efectos ocultos.** No hay triggers en la base. Ningún otro módulo, ni la sincronización con GLPI, lee o escribe `control_acceso`.
- **Las bajas solo se leen.** Un activo dado de baja deja de ser elegible para solicitudes nuevas, pero ni la solicitud cambia el activo ni el activo cambia las solicitudes ya registradas.
- **Comprobado** por la prueba e2e «el flujo completo de una solicitud no altera el activo». Toma un activo en condición «Malo» y recorre alta → pendiente → cierre → reapertura → modificación a BAJA → cierre. Al final, la fila del activo (estado, baja, categoría y `updatedAt`) y su bitácora son idénticas a las de antes.

**Concurrencia al modificar.** Cada cambio se aplica con una actualización condicional (mismo estado y misma `updatedAt`). Si otra petición se adelantó, responde 409 y no se pisa nada.

## Auditoría

- **Qué se registra:** cada campo modificado, con valor anterior y nuevo. Las fechas se guardan en ISO (UTC) y la interfaz las muestra en hora de Guayaquil. Al crear se registra `CREACION` con el código.
- **Campos auditados:**
  - identificación: `codigoUnico`, `tipoAcceso`, `activoId`, `recurso`;
  - fechas: `fechaSolicitud`, `fechaAtendido`;
  - solicitante: `nombreSolicitante`, `cargoSolicitante`;
  - beneficiario: `nombreUsuarioBeneficiario`, `departamento`;
  - contenido: `tipoSolicitud`, `descripcion`;
  - flujo: `estado`, `resolucion`.
- **Usuario:** sale del token de Keycloak (`preferred_username`). El cliente no lo puede enviar (400).
- **Motivo:** opcional al modificar y obligatorio al reabrir y al corregir una cerrada.
- **Entradas de la migración:** las entradas `fechaAccesoDeseada` con usuario `SISTEMA` conservan el último valor de ese campo retirado.
- **Misma transacción.** El cambio y su historial se escriben juntos; si falla la auditoría, el cambio se revierte (lo prueba un e2e).
- **Solo lectura.** No hay rutas para crear, modificar ni borrar el historial (`POST`, `PATCH` y `DELETE /control-acceso/:id/historial` → 404), ni para borrar solicitudes.

## Permisos

| Operación | admin | analista | auditor |
|---|---|---|---|
| Listar, ver detalle e historial, activos elegibles | ✔ | ✔ | ✔ |
| Registrar, modificar (no cerrada), pasar a pendiente, cerrar | ✔ | ✔ | 403 |
| Corregir una cerrada (incluida la fecha atendida) y reabrir | ✔ | 403 | 403 |
| Marcar categorías en Catálogos | ✔ | 403 | 403 |

Todo se valida en la API: `@Roles` en el controlador y, para corregir una cerrada, una comprobación de admin en el servicio. La interfaz además oculta los botones.

## API

| Método y ruta | Uso |
|---|---|
| `GET /api/control-acceso` | Listado paginado. Filtros: `q` (también busca el solicitante), `tipoAcceso`, `estado`, `tipoSolicitud`, `desde`, `hasta` (fecha de solicitud) |
| `GET /api/control-acceso/:id` · `/:id/historial` | Detalle · auditoría |
| `POST /api/control-acceso` | Registrar (exige `nombreSolicitante` y `cargoSolicitante`) |
| `PATCH /api/control-acceso/:id` | Modificar; en una cerrada, corrección del admin (`fechaAtendido`, `resolucion`, `motivo`) |
| `PATCH /api/control-acceso/:id/pendiente` · `/cerrar` (`{ resolucion, fechaAtendido }`) · `/reabrir` | Transiciones |
| `GET /api/control-acceso/activos-elegibles` · `/categorias-elegibles` | Filtro de activos |

**Código:** `gestion-activos-api/src/access-control/`. Es un módulo NestJS independiente que solo usa `ActivosService` del inventario. Las reglas puras están en `reglas.ts`.

**Interfaz:** `gestion-activos-web/src/features/control-acceso/`, con estas pantallas:

- menú *Control de acceso*;
- listado con búsqueda y filtros;
- formulario con selector de activos elegibles (búsqueda en el servidor) o recurso;
- detalle con acciones según el rol e historial.

## Migración y despliegue

- **Migración:** `prisma/migrations/20261020120000_control_acceso`. Es incremental: añade columnas y tablas, inserta categorías con `INSERT IGNORE` y no borra nada.
- **Comandos** (en `gestion-activos-api`): `npx prisma migrate deploy --config prisma7.config.ts`, con `DATABASE_URL` apuntando a la base que corresponda.
- **Procedimiento seguido el 2026-10-20:**
  1. Respaldo de desarrollo con `mysqldump`: `C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-control-acceso-20261020-122614.sql`.
  2. Restauración de comprobación en una base temporal: mismos conteos (455 activos, 21 categorías, 487 entradas de bitácora, 13 migraciones). Después se eliminó la temporal.
  3. Aplicación en `gestion_activos_test` y luego en `gestion_activos_db`. Quedaron los 455 activos.
- **Incidencia en pruebas.** La primera versión llevaba un `CHECK (activoId … OR recurso …)` y MySQL lo rechazó (error 3823). Solo pasó en la base de pruebas:
  1. Se deshizo a mano lo aplicado (MySQL no revierte DDL).
  2. Se marcó la migración con `prisma migrate resolve --rolled-back`.
  3. Se quitó el `CHECK`: la regla queda en el backend.
  4. Se volvió a aplicar.

### Mejora del 2026-10-21: solicitante, fecha atendida y retirada de la fecha deseada

Migración `20261021120000_mejora_control_acceso`, incremental. No borra solicitudes ni la base.

1. **Datos previos.** En desarrollo había **3 solicitudes** (CAL-001, CAF-001, CAL-002), las 3 cerradas, con `fechaAccesoDeseada` y con `fechaAtendido`. En pruebas no había ninguna.
2. **Conservación de `fechaAccesoDeseada` antes de retirarla:**
   - Respaldo completo verificado (restaurado en una base temporal con los mismos conteos y luego eliminada): `C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-mejora-control-acceso-20261021-100613.sql`.
   - Exportación CSV de los 3 valores: `C:\Users\adminqt\gestion-activos-respaldos\control_acceso-fechaAccesoDeseada-20261021-100613.csv`.
   - La propia migración, **antes** de retirar la columna, inserta en `historial_control_acceso` una entrada por solicitud: campo `fechaAccesoDeseada`, su valor en ISO UTC, usuario `SISTEMA` y el motivo. El detalle lo muestra como «Fecha deseada (campo retirado)».
3. **Solicitante:** se añaden `nombreSolicitante` y `cargoSolicitante` como `NULL`. En los registros antiguos no se rellenan (no se inventan) y la interfaz muestra «No registrado». Un admin puede completarlos con motivo si constan en un documento.
4. **Registros antiguos y nulos:**
   - Las 3 solicitudes existentes ya tenían `fechaAtendido`, así que la nueva regla de cierre no deja ninguna en un estado inválido.
   - Los nuevos campos son opcionales en la base; solo se exigen al registrar solicitudes nuevas.
5. **Prueba de la migración con datos reales.** Se restauró el respaldo en una base temporal, se aplicó allí el SQL y se comprobó:
   - las 3 fechas en el historial, iguales al CSV;
   - la columna retirada;
   - el solicitante en `NULL`;
   - los 455 activos y las 3 solicitudes intactos.

   Después se eliminó la temporal y se aplicó en pruebas y en desarrollo con el mismo resultado.

**Comandos** (PowerShell, en `gestion-activos-api`):

```powershell
# Desarrollo (DATABASE_URL del .env)
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate
```

## Pruebas (2026-10-21)

| Tipo | Archivo | Resultado |
|---|---|---|
| Unitarias API | `reglas.spec.ts` (fecha atendida histórica, futura, anterior a la solicitud e inválida) y el resto | 229/229 |
| e2e API | `test/control-acceso.e2e-spec.ts` (22) y el resto de suites | 245/245 en 12 archivos |
| Unitarias web | `features/control-acceso/textos.test.ts` (ALTA/BAJA, «No registrado», atenciones anteriores) y el resto | 108/108 |
| Migración | Sobre una copia temporal del respaldo de desarrollo | Correcta (ver arriba) |
| Navegador real (Chrome) | Analista, admin y auditor contra la base de pruebas | Todo correcto; capturas en `evidencias/2026-10-21-mejora-control-acceso/` (no se versiona) |

**Lo que añadieron estas e2e:**

- no se puede cerrar sin fecha atendida, ni con una fecha mal formada (`«mañana temprano»`, `2026-02-30T25:00Z`), futura o anterior a la solicitud;
- se cierra con una fecha histórica, y se cierra hoy una solicitud de hace un mes con su fecha real;
- la fecha de creación no cambia;
- la fecha atendida y la resolución no se aceptan mientras la solicitud no está cerrada;
- corrección de solicitudes cerradas: admin con motivo (200, auditada); analista y auditor (403); sin motivo (400);
- solicitante y beneficiario separados y auditados;
- solicitudes antiguas sin solicitante;
- altas y bajas por separado, y una baja que no toca el activo;
- persistencia en MySQL.

## Pruebas (2026-10-20)

| Tipo | Archivo | Resultado |
|---|---|---|
| Unitarias API | `reglas.spec.ts`, `glpi-sync/config.spec.ts`, `glpi-sync/sincronizador.spec.ts` (servidores) | 229/229 (toda la API) |
| e2e API | `test/control-acceso.e2e-spec.ts` (17, incluido el aislamiento del estado) y el resto de suites | 240/240 en 12 archivos |
| Unitarias web | `features/control-acceso/textos.test.ts` y el resto | 105/105 |
| Navegador real (Chrome) | Recorrido con admin, analista y auditor contra la base de pruebas | Todo correcto; capturas en `evidencias/2026-10-20-control-acceso/` (no se versiona) |
| GLPI real | Simulación completa en desarrollo y `--aplicar` en la base de pruebas | Sin errores; servidores en su categoría, sin duplicados |

**Lo que cubre el e2e:**

- altas lógicas y físicas, con activo y con recurso;
- códigos por tipo, y 20 altas simultáneas sin repetir;
- campos obligatorios y elegibilidad;
- filtro de activos por tipo y cambio de las marcas desde Catálogos;
- transiciones válidas e inválidas, y cierre (desde el 2026-10-21, con la fecha atendida indicada);
- auditoría de estados, fechas y demás campos, con el usuario del token;
- reversión conjunta si falla el historial;
- historial sin rutas de escritura;
- permisos de cada rol;
- persistencia comprobada en MySQL.

## Limitaciones

- **La elegibilidad es por categoría, no por activo.** Si una categoría mezcla activos que guardan información con otros que no, la marca vale para todos.
- **La categoría de servidor solo se asigna al crear el activo.** Si alguien cambia en GLPI el tipo de equipo de un activo ya importado, hay que reclasificarlo a mano en el inventario.
- **Las solicitudes no figuran todavía en el calendario general**, aunque tienen fecha de solicitud y fecha atendida.
- **Sin fecha deseada no hay avisos de solicitudes «próximas» o «vencidas».** Si se quiere un plazo de atención, habría que definirlo (por ejemplo, días desde la solicitud) como una regla nueva.
- **Las 3 solicitudes anteriores al 2026-10-21 no tienen solicitante.** Solo un admin puede completarlo, con motivo y a partir de un documento.
- **La aplicación registra la solicitud y su atención, pero no otorga ni retira el acceso por sí misma** (por ejemplo, en un directorio o un control de puertas).
