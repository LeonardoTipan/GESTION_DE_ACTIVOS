# Renovaciones: planificación, ejecución y caducidad

Este documento es la referencia del módulo de renovaciones de licencias, garantías, certificados y contratos de servicio. Implementa la «Matriz de Renovación» en **dos fases sobre el mismo registro**: **Planificación** y **Ejecución y cierre**. No hay fase de verificación: la evidencia se exige al cerrar.

## 1. Relación con GLPI

- **El activo es el sistema que trae la sincronización con GLPI.** La renovación lo referencia con una clave foránea (`renovacion.activoId`). No crea activos, no copia su nombre y **nunca lo modifica**; lo comprueba una prueba e2e.
- **Solo se planifica sobre activos operativos.** El historial se conserva aunque el activo deje de estarlo. La clave foránea es RESTRICT: un activo con renovaciones no se borra físicamente.
- **GLPI no aporta fechas de caducidad.** La sincronización actual no trae la expiración de licencias, certificados ni garantías, así que la caducidad la registra una persona.
- **Clase Hardware o Software.** Sale de la categoría del activo (la elige el admin en Catálogos), nunca del nombre.

## 2. Correspondencia con la matriz institucional

| Matriz | Fase | Campo definitivo | Tipo | Notas |
|---|---|---|---|---|
| Fecha Planificada | Planificación | `fechaPlanificada` | DATE, obligatorio | Día previsto |
| Sistema | Planificación | `activoId` → `activo` | FK | Código, nombre, categoría y clase |
| Responsable | Planificación | `responsable` | VARCHAR(191), obligatorio | Texto: las identidades viven en Keycloak |
| — | Planificación | `tipo` | ENUM | Licencia, Garantía, Certificado, Contrato de servicio, Otro |
| — | Planificación | `fechaCaducidadActual` / `sinCaducidadActual` | DATE / BOOLEAN | Vigencia **antes** de renovar; nunca se sobrescribe |
| Fecha Ejecutada Renovación | Ejecución | `fechaRenovacion` | DATE | Fecha **real**, manual |
| (dentro de la Descripción) | Ejecución | `nuevaFechaCaducidad` / `nuevaSinCaducidad` | DATE / BOOLEAN | Vigencia **después** de renovar, en su propio campo |
| Verificable | Ejecución | `evidencia` | VARCHAR(191) | Contrato, factura, certificado o informe |
| Repositorio Verificable | Ejecución | `repositorioVerificable` | VARCHAR(191) | Carpeta o URL http(s) |
| Descripción | Ejecución | `descripcion` | TEXT | Detalle de lo realizado |
| Observación | Ambas | `observacion` | TEXT | Justifica la ausencia de caducidad |
| — | Ejecución | `estado` | ENUM | ABIERTO, EN_PROGRESO, CERRADO |

Sobre la matriz y el modelo:

- En el ejemplo de la matriz, la nueva vigencia estaba escrita dentro de la descripción («…con proveedor XXXXX hasta el 27/04/2029»). Ahora va en `nuevaFechaCaducidad`.
- `createdAt` y `updatedAt` son la fecha de registro y la de última modificación.
- `cerradaPor` guarda el usuario que cerró la renovación.
- `renovacionAnteriorId` enlaza las renovaciones sucesivas del mismo elemento.
- **El costo quedó fuera de alcance**, por decisión del usuario.

## 3. Fechas y caducidad

Hay seis fechas distintas. Las cuatro primeras son **días**, sin hora, y no dependen de la zona horaria:

| Fecha | Qué significa | Quién la pone |
|---|---|---|
| Planificada | Día previsto para renovar | El usuario |
| Caducidad actual | Hasta cuándo valía antes de renovar | El usuario |
| Renovación real | Cuándo se renovó realmente | El usuario (**nunca** el servidor) |
| Nueva caducidad | Hasta cuándo vale después | El usuario |
| Registro y última modificación | Auditoría | Automáticas |

**Reglas de coherencia** (devuelven 400 con el motivo):

- **Formato:** solo se acepta `AAAA-MM-DD`. Un día inexistente, como 2026-02-30, se rechaza.
- **Renovación real:** puede ser histórica, pero no futura (respecto al día de hoy en Guayaquil).
- **Nueva caducidad:**
  - posterior a la fecha real de renovación;
  - posterior a la caducidad actual, porque una renovación amplía la vigencia.
- **«Sin caducidad conocida o aplicable»** (por ejemplo, una licencia perpetua):
  - es una marca explícita, separada para la vigencia actual y para la nueva;
  - deja la fecha vacía y exige justificarlo en la observación;
  - no admite fecha y marca a la vez;
  - no se inventan fechas.

**Vigencia del elemento.** Se calcula y es distinta del estado del proceso; una renovación puede estar ABIERTA con la licencia aún vigente.

- **Fecha que rige:**
  - antes de cerrar, la caducidad actual;
  - una vez cerrada, la nueva caducidad.
  - Ambas se conservan.
- **Valores:**
  - **Vigente:** quedan más días que el umbral.
  - **Próximo a caducar:** quedan entre 0 y el umbral. El último día todavía cuenta como vigente.
  - **Caducado:** el día ya pasó.
  - **Sin caducidad.**
  - **Renovado después:** hay una renovación posterior del mismo elemento, y rige esa.
- **Umbral:** `RENOVACIONES_DIAS_AVISO`, de 1 a 365 días; 30 por defecto (está documentado en `.env.example`).
- **Avisos:** no hay correo ni tareas programadas. Las alertas son las cifras del listado, el bloque «Próximas caducidades» y los filtros.

## 4. Estados y cierre

```
ABIERTO ──iniciar──► EN_PROGRESO ──cerrar──► CERRADO
   └─────────────cerrar──────────────────┘     │
                     ▲                         │
                     └──────reabrir────────────┘
```

**Cerrar exige:**

- la fecha real de renovación;
- la nueva caducidad, o «sin caducidad» justificado;
- el verificable y el repositorio.

Además:

- El mensaje enumera **qué falta**, y la interfaz marca los campos.
- **Guardar** los datos no cierra.
- **Corregir una cerrada** es solo para el admin y exige motivo.
- **Reabrir** (con motivo) vacía la fecha real y la nueva caducidad **vigentes**. Las anteriores quedan en la auditoría. No se reabre una renovación ya sustituida.
- **Renovar de nuevo** el mismo elemento (mismo activo y tipo) crea un registro **nuevo** enlazado con el anterior, que conserva sus fechas. La interfaz sugiere como caducidad actual la nueva caducidad de la renovación anterior, y el usuario la confirma.
- **Una sola pendiente:** solo puede haber una renovación pendiente por elemento (409).

## 5. Auditoría

Se reutiliza la auditoría común (`TrazasService`, tabla `registro_cambio`, entidad `RENOVACION`).

- **Alta:** acción `REGISTRAR`.
- **Modificaciones y cambios de estado:** acción `MODIFICAR`, con campo, valor anterior, valor nuevo, motivo, usuario de la sesión y fecha.
- **Transacción y concurrencia:** el cambio y su traza van en la misma transacción. La actualización es condicional por versión y estado: si otra petición se adelantó, devuelve 409 y no guarda nada.

## 6. Endpoints

| Método y ruta | Roles | Uso |
|---|---|---|
| `GET /api/renovaciones` | todos | Lista paginada. Filtros: `activoId`, `categoriaId`, `tipo`, `estado`, `pendientes`, `responsable`, `vigencia`, `caducaDesde`/`caducaHasta`, `q` |
| `GET /api/renovaciones/resumen` | todos | Cuántas hay vigentes, próximas, caducadas y sin caducidad, con el umbral |
| `GET /api/renovaciones/caducidades?dias=` | todos | Próximas caducidades y caducadas, por urgencia |
| `GET /api/renovaciones/{id}` | todos | Detalle (vigencia, renovación anterior y posterior) |
| `POST /api/renovaciones` | admin, analista | Planificar (ABIERTO) |
| `PATCH /api/renovaciones/{id}` | admin, analista | Corregir la planificación con motivo |
| `PATCH /api/renovaciones/{id}/iniciar` | admin, analista | ABIERTO → EN_PROGRESO |
| `PATCH /api/renovaciones/{id}/ejecucion` | admin, analista (cerrada: admin) | Guardar o corregir lo ejecutado |
| `PATCH /api/renovaciones/{id}/cerrar` | admin, analista | → CERRADO |
| `PATCH /api/renovaciones/{id}/reabrir` | admin, analista | CERRADO → EN_PROGRESO |
| `POST /api/renovaciones/{id}/anular` · `/reversar` | admin | Anulación lógica |
| `GET /api/trazas?entidad=RENOVACION&registroId={id}` | todos | Historial |

## 7. Migración y comandos

Migración `prisma/migrations/20261027120000_renovaciones`:

- Crea la tabla `renovacion` con sus índices y dos claves foráneas.
- **No toca tablas existentes.**
- El SQL se generó con `prisma migrate diff` y se revisó antes de aplicarlo.
- Se aplicó primero en `gestion_activos_test` y después en `gestion_activos_db`, tras un respaldo restaurado y verificado.

Desde `gestion-activos-api`:

```bash
npx prisma migrate deploy && npx prisma generate
npm run build && npm run start:dev
npm test && npm run test:e2e && npm run lint
```

Desde `gestion-activos-web`:

```bash
npm run api:generate
npm run dev
npm test && npm run build && npm run lint
```

## 8. Limitaciones y decisiones pendientes

- **GLPI no aporta caducidades:** se registran a mano. Importar la expiración de licencias y certificados de GLPI sería otra fase.
- **Responsable en texto libre:** no hay un catálogo de usuarios en la aplicación.
- **La evidencia es una referencia** (nombre y carpeta o URL): la aplicación no almacena archivos.
- **Sin notificaciones automáticas:** no hay correo ni tareas programadas.
- **Sin costo.** Si se aprueba, se añadiría como un campo opcional en Ejecución.
