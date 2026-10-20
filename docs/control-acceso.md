# Control de acceso

Solicitudes de acceso **lógico** (sistemas, información) y **físico** (equipos, salas). Cada solicitud es un **alta** (`ACCESO`) o una **baja** (`BAJA`) del acceso. Sigue un flujo de atención y cada cambio queda auditado.

El módulo forma parte de la misma aplicación:

- **Base de datos:** la misma (MySQL, Prisma).
- **Autenticación:** Keycloak, con los roles de siempre.
- **Inventario:** se apoya en el modelo `Activo` y en las categorías que vienen de GLPI.

Normas ISO/IEC 27001:2022 de referencia: A.5.15 Control de acceso, A.5.18 Derechos de acceso y A.7.2 Entrada física.

## Modelo de datos

Una sola tabla principal para los dos tipos, con `tipoAcceso` como discriminador (migración `20261020120000_control_acceso`).

**`control_acceso`**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | INT autoincremental | Clave primaria |
| `codigoUnico` | VARCHAR(20), **único** | `CAL-001` (lógico) o `CAF-001` (físico); lo genera el backend |
| `tipoAcceso` | ENUM `LOGICO`, `FISICO` | |
| `activoId` | INT, opcional | Clave foránea a `activo` (`ON DELETE RESTRICT`) |
| `recurso` | VARCHAR(191), opcional | Recurso no inventariado (correo institucional, sala de servidores…) |
| `fechaSolicitud` | DATETIME | Cuándo se pidió; no futura |
| `fechaAccesoDeseada` | DATETIME | Cuándo se espera el acceso o la baja; no anterior a la solicitud |
| `nombreUsuarioBeneficiario`, `departamento` | VARCHAR(191) | |
| `tipoSolicitud` | ENUM `ACCESO`, `BAJA` | |
| `descripcion` | TEXT | Motivo (mínimo 10 caracteres) |
| `estado` | ENUM `ABIERTO`, `PENDIENTE`, `CERRADO` | `ABIERTO` al crear (lo pone el backend) |
| `resolucion` | TEXT, opcional | Qué se hizo; obligatoria al cerrar |
| `fechaCreacion` | DATETIME | Automática; no editable |
| `fechaAtendido` | DATETIME, opcional | Fecha real del cierre; la pone el backend |

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
| Cerrar | `ABIERTO` o `PENDIENTE` | `CERRADO` | admin, analista | Resolución (≥10 caracteres); `fechaAtendido` = ahora, en el servidor |
| Reabrir | `CERRADO` | `PENDIENTE` | **solo admin** | Motivo (≥20); quita la resolución y la fecha de atención (quedan en el historial) |
| Modificar | `ABIERTO` o `PENDIENTE` | — | admin, analista | Una cerrada se reabre primero; el tipo de acceso, solo en `ABIERTO` |

- Cualquier otra transición devuelve **409**.
- **Bajas:** una `BAJA` sigue el mismo flujo; al cerrarla, la resolución describe cómo se **retiró** el acceso.
- **El estado no depende de la fecha.** La situación se calcula aparte y no sobrescribe el estado:

| Situación | Cuándo |
|---|---|
| Atendida | Está cerrada |
| Vencida | No cerrada y la fecha deseada ya pasó |
| Próxima | No cerrada y la fecha deseada llega en las próximas 48 h |
| Programada | No cerrada y la fecha deseada es posterior |

**Concurrencia al modificar.** Cada cambio se aplica con una actualización condicional (mismo estado y misma `updatedAt`). Si otra petición se adelantó, responde 409 y no se pisa nada.

## Auditoría

- **Qué se registra:** cada campo modificado, con valor anterior y nuevo. Las fechas se guardan en ISO (UTC) y la interfaz las muestra en hora de Guayaquil. Al crear se registra `CREACION` con el código.
- **Campos auditados:**
  - identificación: `codigoUnico`, `tipoAcceso`, `activoId`, `recurso`;
  - fechas: `fechaSolicitud`, `fechaAccesoDeseada`, `fechaAtendido`;
  - beneficiario: `nombreUsuarioBeneficiario`, `departamento`;
  - contenido: `tipoSolicitud`, `descripcion`;
  - flujo: `estado`, `resolucion`.
- **Usuario:** sale del token de Keycloak (`preferred_username`). El cliente no lo puede enviar.
- **Motivo:** opcional al modificar y obligatorio al reabrir.
- **Misma transacción.** El cambio y su historial se escriben juntos; si falla la auditoría, el cambio se revierte (lo prueba un e2e).
- **Solo lectura.** No hay rutas para crear, modificar ni borrar el historial (`POST`, `PATCH` y `DELETE /control-acceso/:id/historial` → 404), ni para borrar solicitudes.

## Permisos

| Operación | admin | analista | auditor |
|---|---|---|---|
| Listar, ver detalle e historial, activos elegibles | ✔ | ✔ | ✔ |
| Registrar, modificar, pasar a pendiente, cerrar | ✔ | ✔ | 403 |
| Reabrir | ✔ | 403 | 403 |
| Marcar categorías en Catálogos | ✔ | 403 | 403 |

Todo se valida en la API (`@Roles`); la interfaz además oculta los botones.

## API

| Método y ruta | Uso |
|---|---|
| `GET /api/control-acceso` | Listado paginado. Filtros: `q`, `tipoAcceso`, `estado`, `tipoSolicitud`, `situacion`, `desde`, `hasta` (fecha deseada) |
| `GET /api/control-acceso/:id` · `/:id/historial` | Detalle · auditoría |
| `POST /api/control-acceso` | Registrar |
| `PATCH /api/control-acceso/:id` | Modificar |
| `PATCH /api/control-acceso/:id/pendiente` · `/cerrar` · `/reabrir` | Transiciones |
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

## Pruebas (2026-10-20)

| Tipo | Archivo | Resultado |
|---|---|---|
| Unitarias API | `reglas.spec.ts`, `glpi-sync/config.spec.ts`, `glpi-sync/sincronizador.spec.ts` (servidores) | 229/229 (toda la API) |
| e2e API | `test/control-acceso.e2e-spec.ts` (16) y el resto de suites | 239/239 en 12 archivos |
| Unitarias web | `features/control-acceso/textos.test.ts` y el resto | 105/105 |
| Navegador real (Chrome) | Recorrido con admin, analista y auditor contra la base de pruebas | Todo correcto; capturas en `evidencias/2026-10-20-control-acceso/` (no se versiona) |
| GLPI real | Simulación completa en desarrollo y `--aplicar` en la base de pruebas | Sin errores; servidores en su categoría, sin duplicados |

**Lo que cubre el e2e:**

- altas lógicas y físicas, con activo y con recurso;
- códigos por tipo, y 20 altas simultáneas sin repetir;
- campos obligatorios y elegibilidad;
- filtro de activos por tipo y cambio de las marcas desde Catálogos;
- transiciones válidas e inválidas, y cierre con la fecha del servidor;
- auditoría de estados, fechas y demás campos, con el usuario del token;
- reversión conjunta si falla el historial;
- historial sin rutas de escritura;
- permisos de cada rol;
- persistencia comprobada en MySQL.

## Limitaciones

- **La elegibilidad es por categoría, no por activo.** Si una categoría mezcla activos que guardan información con otros que no, la marca vale para todos.
- **La categoría de servidor solo se asigna al crear el activo.** Si alguien cambia en GLPI el tipo de equipo de un activo ya importado, hay que reclasificarlo a mano en el inventario.
- **Las solicitudes no figuran todavía en el calendario general**, aunque tienen fecha deseada y fecha de atención.
- **La aplicación registra la solicitud y su atención, pero no otorga ni retira el acceso por sí misma** (por ejemplo, en un directorio o un control de puertas).
