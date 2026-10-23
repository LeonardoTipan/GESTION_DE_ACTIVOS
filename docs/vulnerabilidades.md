# Vulnerabilidades: detección y remediación

Este documento es la referencia del módulo de vulnerabilidades. Implementa la «Matriz de Amenazas y Vulnerabilidades» en **dos fases sobre el mismo registro**: **Detección** y **Remediación**. No hay fase de verificación: la evidencia se exige dentro de Remediación, antes de cerrar.

Norma de referencia: ISO/IEC 27001:2022, A.8.8 *Gestión de las vulnerabilidades técnicas*.

## 1. Relación con GLPI

- **El activo y la vulnerabilidad son entidades distintas.**
  - El activo es el sistema que trae la sincronización con GLPI (`activo`).
  - La vulnerabilidad es un problema detectado en ese sistema (`vulnerabilidad.activoId`, clave foránea).
  - Un activo puede tener varias vulnerabilidades, cada una con su criticidad, responsable, estado y fechas. Remediar una no significa que el activo esté resuelto.
- **El módulo no crea activos** ni copia su nombre: muestra el código y el nombre a través de la relación.
- **Solo se registran vulnerabilidades sobre activos operativos.** No se admiten activos dados de baja ni en la papelera de GLPI (400 con el motivo). El **historial se conserva** aunque el activo deje de estar operativo.
- **El estado de una vulnerabilidad nunca modifica el activo** (estado, baja ni inactividad). Lo comprueba una prueba e2e.
- **Clase Hardware o Software.**
  - Sale de la categoría del activo (`categoria.claseMantenimiento`), que el admin elige en Catálogos, igual que las marcas de Control de acceso.
  - Nunca se deduce del nombre del activo.
  - Las categorías sin clasificar se muestran como «Sin clasificar».

## 2. Correspondencia de los 10 campos

| # | Campo de la matriz | Fase | Campo definitivo | Tipo | Notas |
|---|---|---|---|---|---|
| 1 | Fecha Detección | Detección | `fecha` | DATETIME, obligatorio | La indica el usuario; puede ser histórica, no futura. ≠ `createdAt` (fecha de registro) |
| 2 | Sistema | Detección | `activoId` → `activo` | FK a `activo` | Activo operativo de GLPI; se muestran código, nombre, categoría y clase |
| 3 | Vulnerabilidad | Detección | `descripcion` | TEXT, obligatorio | No es la observación ni la evidencia |
| 4 | Criticidad | Detección | `nivelRiesgo` | ENUM `CRITICO`, `ALTO`, `MEDIO`, `BAJO` | Enum que ya existía. Corregible con motivo; queda en la auditoría |
| 5 | Responsable | Detección | `responsable` | VARCHAR(191), obligatorio | Texto: no hay modelo de usuarios (las identidades viven en Keycloak) |
| 6 | Fecha de Remediación | Remediación | `fechaRemediacion` | DATETIME, opcional, **sin valor por defecto** | Fecha REAL de la solución, indicada por el usuario. Columna `fechaCierre` renombrada |
| 7 | Estado | Remediación | `estado` | ENUM `ABIERTO`, `EN_PROGRESO`, `REMEDIADO` | Distinto de la criticidad |
| 8 | Verificable | Remediación | `evidencia` | VARCHAR(191) | Nombre del informe o documento |
| 9 | Repositorio Verificable | Remediación | `repositorioVerificable` | VARCHAR(191) | **Nuevo.** Carpeta compartida o URL http(s) |
| 10 | Observación | Remediación | `observacion` | TEXT | Columna `mitigacion` renombrada |

Además de los 10 campos:

- `cve` y `fechaLimite` (plazo de remediación) son opcionales en Detección, por decisión del usuario.
- `tratamientoIniciadoEn` guarda el inicio real, también opcional.
- `cerradaPor` guarda quién registró la remediación.
- `createdAt` es la fecha de registro.
- `version` y la anulación lógica siguen el patrón de los demás módulos.

### Lo que se retiró del diseño anterior en tres capas

Tablas y columnas se **conservan** en la base, sin uso; no se borró nada.

- Confirmación (`confirmadaEn`, `confirmadaPor`).
- Evaluación (`prioridad`, `planRemediacion`, `evaluadaEn`, `evaluadaPor`).
- Tratamiento previsto, ampliación de plazo y ventana de verificación (`tratamientoPrevisto`, `fechaLimiteOriginal`, `verificacionPrevista`, `verificacionLimite`).
- La fuente del hallazgo (`fuente`, queda en `MANUAL`).
- Las tablas `accion_remediacion` y `verificacion_vulnerabilidad`.
- El estado `ACEPTADA` (aceptar el riesgo), que se quitó por decisión del usuario.

### Modelo Prisma

```prisma
model Vulnerabilidad {
  id                     Int                  @id @default(autoincrement())
  activoId               Int                  // «Sistema»
  cve                    String?
  descripcion            String               @db.Text   // «Vulnerabilidad»
  nivelRiesgo            NivelRiesgo                     // «Criticidad»
  estado                 EstadoVulnerabilidad @default(ABIERTO)
  observacion            String?              @db.Text   // «Observación»
  fecha                  DateTime                        // «Fecha Detección»
  fechaLimite            DateTime?
  fechaRemediacion       DateTime?                       // «Fecha de Remediación» (real, sin default)
  evidencia              String?                         // «Verificable»
  repositorioVerificable String?                         // «Repositorio Verificable»
  responsable            String?                         // «Responsable»
  cerradaPor             String?
  tratamientoIniciadoEn  DateTime?
  // … columnas conservadas sin uso, version, anulación, createdAt, updatedAt
  activo Activo @relation(fields: [activoId], references: [id])
  @@index([activoId, estado])
  @@map("vulnerabilidad")
}

enum EstadoVulnerabilidad { ABIERTO EN_PROGRESO REMEDIADO }
```

El código completo está en `gestion-activos-api/prisma/schema.prisma`.

## 3. Flujo de las dos fases

```
Detección ─► ABIERTO ──iniciar──► EN_PROGRESO ──remediar──► REMEDIADO
                 └──────────────remediar───────────────────────┘    │
                                   ▲                                 │
                                   └─────────────reabrir─────────────┘
```

| Acción | Desde | Hacia | Exige | Roles |
|---|---|---|---|---|
| Registrar (Detección) | — | ABIERTO | Activo operativo, fecha de detección, vulnerabilidad, criticidad y responsable | admin, analista |
| Corregir detección | ABIERTO, EN_PROGRESO | (igual) | Motivo | admin, analista |
| Iniciar | ABIERTO | EN_PROGRESO | Inicio real opcional | admin, analista |
| Guardar datos de remediación | ABIERTO, EN_PROGRESO | (igual) | Nada: **no cierra** aunque haya fecha | admin, analista |
| Remediar | ABIERTO, EN_PROGRESO | REMEDIADO | **Fecha real**, **verificable** y **repositorio** válidos | admin, analista |
| Corregir remediación | REMEDIADO | (igual) | Motivo; sigue cumpliendo los requisitos de cierre | solo admin |
| Reabrir | REMEDIADO | EN_PROGRESO | Motivo (≥ 20 caracteres) | admin, analista |
| Anular / revertir | cualquiera | (igual) | Motivo | solo admin |

- **Remediar desde ABIERTO** cubre lo que se corrigió antes de registrarse.
- **Cualquier otra transición devuelve 409.**
- **La interfaz** tiene dos pestañas en el listado (Detección: todo el registro; Remediación: lo pendiente) y dos pestañas en la ficha de cada vulnerabilidad. El indicador de pasos tiene exactamente dos: Detección → Remediación.

### Fecha de remediación manual y evidencia

- **La fecha de remediación la escribe el usuario.**
  - El servidor nunca usa `now()` para ella.
  - Admite fechas históricas: se solucionó el 27/04/2026 y se registró el 30/04/2026.
  - Se rechaza si es futura o anterior a la detección (400). No hay excepción aprobada para esto último.
- **Guardar una fecha no remedia:** el estado solo cambia con *Remediar*.
- **Para cerrar se exigen** la fecha real, el verificable y el repositorio.
  - El repositorio es una carpeta o ruta (también `C:\…` o `\\servidor\…`) o una URL http(s).
  - Se rechazan otros esquemas (`javascript:`, `file:`).
  - La aplicación no almacena archivos ni los sirve: es una referencia.
  - La validación es la misma en la API (`common/evidencia/repositorio.ts`) y en la interfaz (`shared/evidencia.ts`).
- **Al reabrir:**
  - Se vacía la fecha de remediación **vigente**. La anterior, con quién la registró y cuándo, queda en la auditoría.
  - El verificable, el repositorio y la observación se conservan como referencia para la siguiente remediación.

## 4. Auditoría y transacciones

Se reutiliza la auditoría común (`TrazasService`, tabla `registro_cambio`), la misma de Mantenimiento. No hay un historial paralelo.

- **Alta.** Nueva acción `REGISTRAR`: quién registró la detección y con qué valores. Va en la misma transacción que la creación; si falla la traza, no queda el registro.
- **Cambios.**
  - Afectan a la criticidad, el responsable, el estado, la fecha de remediación, el verificable, el repositorio, la descripción y la observación.
  - Se aplican con `trazas.modificar`: una actualización condicional por versión y estado, y la traza (campo, antes, después, motivo, usuario de la sesión, fecha) en la **misma transacción**.
  - Si otra petición se adelantó, se devuelve 409, sin traza y sin subir la versión.
- **Usuario.** El usuario sale del token (`@CurrentUser`), nunca del cuerpo de la petición.
- **Avisos.** Los de vulnerabilidad crítica (al registrar o al subir a crítica) y vulnerabilidad reabierta se escriben en la misma transacción, con el nuevo parámetro `ademas` de `trazas.modificar`.

## 5. Endpoints

| Método y ruta | Roles | Uso |
|---|---|---|
| `GET /api/vulnerabilidades` | todos | Lista paginada. Filtros: `activoId`, `categoriaId`, `nivelRiesgo`, `responsable`, `estado`, `desde`/`hasta` (fecha de detección), `q`, `cve`, `abiertas`, `vencidas`, `actualizadoDesde` |
| `GET /api/vulnerabilidades/{id}` | todos | Detalle |
| `GET /api/vulnerabilidades/indicadores` | todos | VUL-01 a VUL-04 (con la fecha real de remediación) |
| `GET /api/vulnerabilidades/agenda` | todos | Calendario: capa 1 Detección, capa 2 Remediación (la capa 3 viene vacía) |
| `POST /api/vulnerabilidades` | admin, analista | Detección en un activo |
| `POST /api/vulnerabilidades/lote` | admin, analista | Detección en varios activos (todos o ninguno) |
| `PATCH /api/vulnerabilidades/{id}` | admin, analista | Corregir la detección, con motivo |
| `PATCH /api/vulnerabilidades/{id}/iniciar` | admin, analista | ABIERTO → EN_PROGRESO |
| `PATCH /api/vulnerabilidades/{id}/remediacion` | admin, analista (remediada: admin) | Guardar o corregir datos de remediación |
| `PATCH /api/vulnerabilidades/{id}/remediar` | admin, analista | → REMEDIADO |
| `PATCH /api/vulnerabilidades/{id}/reabrir` | admin, analista | REMEDIADO → EN_PROGRESO |
| `POST /api/vulnerabilidades/{id}/anular` · `/reversar` | admin | Anulación lógica |
| `GET /api/trazas?entidad=VULNERABILIDAD&registroId={id}` | todos | Historial de auditoría |

Se retiraron: `confirmar`, `evaluar`, `iniciar-mitigacion`, `aceptar-riesgo`, `plazo`, `verificacion-prevista`, `acciones` y `verificaciones`.

## 6. Migración

Migración `prisma/migrations/20261023120000_vulnerabilidades_deteccion_remediacion`. Es **incremental**: no borra tablas, columnas ni registros.

1. **Estados.**
   - Paso intermedio con los valores antiguos y los nuevos a la vez.
   - Traslado de datos: ABIERTA → ABIERTO, EN_MITIGACION → EN_PROGRESO, MITIGADA → REMEDIADO.
   - Enum final sin ACEPTADA. Si quedara alguna fila ACEPTADA, el último paso falla (modo estricto) en lugar de reinterpretarla.
2. **Renombrados** (conservan los datos): `fechaCierre` → `fechaRemediacion` y `mitigacion` → `observacion`. Prisma, por sí solo, habría generado `DROP COLUMN` + `ADD COLUMN`; por eso la migración se escribió a mano.
3. **Columna nueva:** `repositorioVerificable`.
4. **Índice nuevo:** `(activoId, estado)`.

Estado real:

- En desarrollo había 0 vulnerabilidades, 0 acciones y 0 verificaciones; no se transformó ningún dato.
- Se aplicó primero en `gestion_activos_test` y después en `gestion_activos_db`, tras un respaldo restaurado y verificado en una base temporal.
- `prisma migrate diff` contra la base no muestra diferencias.

## 7. Comandos

Desde `gestion-activos-api`:

```bash
npx prisma migrate deploy        # aplica las migraciones pendientes (DATABASE_URL del .env)
npx prisma generate              # cliente en src/generated
npm run build && npm run start:dev
npm test                         # unitarias (vitest)
npm run test:e2e                 # e2e: aplica migraciones a gestion_activos_test y la vacía
npm run lint
```

En este proyecto las migraciones se escriben a mano y se aplican con `migrate deploy`. `npx prisma migrate dev` no se usa: la terminal no es interactiva y, además, habría propuesto borrar y recrear las columnas renombradas.

Desde `gestion-activos-web`:

```bash
npm run api:generate   # tipos desde http://localhost:3000/api/docs-json
npm run dev
npm test && npm run build && npm run lint
```

## 8. Limitaciones y decisiones pendientes

- **Responsable en texto libre.** No hay un catálogo de usuarios en la aplicación (Keycloak es la fuente de identidades). Relacionarlo con usuarios exigiría consultar la API de administración de Keycloak.
- **La evidencia es una referencia** (nombre del documento y carpeta o URL), no un archivo almacenado: la aplicación no tiene sistema de archivos. El acceso a la carpeta o URL depende de los permisos de ese repositorio.
- **Columnas y tablas antiguas.** Las del diseño en tres capas se conservan sin uso. Retirarlas es una decisión pendiente, igual que en Mantenimiento.
- **Sin escáner conectado:** todo hallazgo se registra a mano.
