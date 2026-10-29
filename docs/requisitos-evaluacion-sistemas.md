# Evaluación de Sistemas Productivos · requisitos funcionales

**Estado (29/10/2026):** **fase 1 implementada** (sin commitear). La fase 2 sigue siendo especificación.

## Implementado · fase 1

- **Persistencia:** modelo `EvaluacionSistema`, tabla `evaluacion_sistema`, migración `20261029151000_evaluacion_sistemas`. Está aplicada **solo en la base de pruebas**; en desarrollo y producción sigue pendiente (ver [categorias-aplicacion.md](categorias-aplicacion.md)).
  - Campos: `activoId` (clave foránea a `activo`, `ON DELETE RESTRICT`), `fechaProgramadaProduccion`, `responsable`, `descripcion`, `estado` (ABIERTO, EN_PROGRESO, CERRADO; nace ABIERTO), `version`, los de anulación lógica, `createdAt` y `updatedAt`.
  - Índices `(activoId, estado)` y `(fechaProgramadaProduccion)`.
- **API** (módulo `src/production-evaluation/`):
  - `GET /api/evaluaciones-sistemas?q&activoId&estado&pendientes&vencidas&desde&hasta&incluirAnulados&page&limit`: todos los roles. Ordena por fecha programada ascendente; cada fila trae `vencida` (fecha pasada y sin cerrar).
  - `POST /api/evaluaciones-sistemas` (`activoId`, `fechaProgramadaProduccion`, `responsable`, `descripcion` de 10 a 2000 caracteres): admin y analista.
    - 400 si el activo no está operativo o su categoría no tiene `aplicaEvaluacion`.
    - 409 si el sistema ya tiene una evaluación pendiente.
    - Alta auditada (entidad `EVALUACION_SISTEMA`) en la misma transacción.
- **Diferencias con la propuesta de abajo** (decisiones de implementación, revisables):
  - «Cambio o versión» y «Observación» se reúnen en un único campo obligatorio, **«Descripción planificada»**.
  - No hay fecha de solicitud: la fecha de registro (`createdAt`) es automática y distinta de la fecha programada.
  - El duplicado se controla por **sistema** (una pendiente por activo), no por sistema y versión, porque no hay campo de versión.
- **Pantalla `/evaluacion-sistemas-productivos`**, con el patrón de Planificación de Mantenimientos:
  - cifras «Pasos a producción en 60 días», «Sistemas elegibles» y «Evaluaciones vencidas»;
  - paneles «Calendario · próximos 60 días» y «Sistemas elegibles para evaluación»;
  - sección «Planificaciones de evaluación» con «Nueva planificación», filtros Buscar, Estado y «Solo vencidas», y tabla paginada.
  - Modal: selector de activos (solo los de categorías con Evaluación; uno solo), fecha programada de paso a producción, Asignado, Descripción planificada; Cancelar / «Planificar».
- **Aún no:** la fase 2 (fecha real de las pruebas, informe, cierre), y la corrección y la anulación (ver «Cambios necesarios» al final). Ya cuenta en el panel global de pendientes (`evaluaciones`; ABIERTO + EN_PROGRESO, sin anuladas; las vencidas van incluidas, no se suman aparte).

Lo marcado **[PROPUESTA]** completa los requisitos del usuario y necesita aprobación. Lo marcado **[PREGUNTA]** necesita una decisión.

## Objetivo

Registrar que un **sistema de software** se evaluó en seguridad antes de su **paso a producción**, con la evidencia correspondiente.

Sigue el patrón de dos fases sobre el **mismo registro**: no hay fase de verificación aparte y la evidencia se exige al cerrar.

## Fase 1 · Planificación

| Campo | Regla |
|---|---|
| Sistema (activo de software) | Obligatorio. Activo **operativo** de una categoría con `aplicaEvaluacion`, validado en el backend como en los demás módulos |
| Fecha programada de paso a producción | **Obligatoria.** Es la fecha prevista para salir a producción y **no es la fecha de solicitud**. Puede ser futura |
| Fecha de solicitud **[PROPUESTA]** | Opcional y **en un campo distinto**, si se quiere conservar cuándo se pidió. Nunca reemplaza a la programada. No puede ser posterior a la fecha programada |
| Cambio o versión que pasa a producción **[PROPUESTA]** | Texto obligatorio, por ejemplo «Módulo de nómina v2.1» |
| Responsable | Obligatorio, texto |
| Observación | Opcional |

El registro queda **ABIERTO**.

## Fase 2 · Ejecución y cierre

| Campo | Regla |
|---|---|
| Fecha real de las pruebas de seguridad | **Obligatoria para cerrar.** La indica el usuario (nunca la del servidor). Puede ser histórica, no futura y no anterior a la fecha de solicitud, si existe |
| Informe verificable | **Obligatorio para cerrar:** nombre del informe de las pruebas |
| Repositorio verificable | **Obligatorio para cerrar:** carpeta o URL http(s), con la misma validación que los demás módulos |
| Resultado **[PREGUNTA]** | ¿Hace falta? Por ejemplo: Aprobado / Aprobado con observaciones / No aprobado |
| Observación | Opcional; obligatoria si las pruebas son posteriores a la fecha programada (ver reglas) |

## Estados y transiciones

- **ABIERTO** (planificado) → **EN_PROGRESO** (al iniciar o al guardar datos de la fase 2 sin cerrar) → **CERRADO**.
- **Cerrar** exige: fecha real de las pruebas, informe verificable y repositorio. El mensaje dice qué falta. Guardar no cierra.
- **Reabrir** (CERRADO → EN_PROGRESO) exige motivo. Los valores anteriores quedan en la auditoría.
- **Corregir lo cerrado:** solo admin, con motivo.
- **Corregir la planificación** (sistema, fechas, cambio) mientras está ABIERTO o EN_PROGRESO: admin y analista, con motivo. El sistema solo se cambia en ABIERTO.
- **Anulación lógica:** solo admin, como en los demás módulos.

## Reglas de fechas [PROPUESTA]

- Las pruebas de seguridad deberían ser **anteriores o iguales** a la fecha programada de paso a producción.
  - Si son posteriores, se permite cerrar con **justificación en la observación**, para que conste que se probó tarde.
  - **[PREGUNTA]** ¿Debe bloquearse?
- **Pasada la fecha programada sin cerrar**, la evaluación aparece como **vencida** en el tablero y en los filtros.
- **[PREGUNTA]** ¿Se registra también la **fecha real** de paso a producción? Sería un tercer campo, distinto de la programada y de la de solicitud.

## No duplicar

**[PROPUESTA]** Solo una evaluación **pendiente** (ABIERTO o EN_PROGRESO) por sistema y cambio o versión. Se permiten varias por sistema, una por cada versión que pasa a producción. Se responde 409 con un mensaje claro.

## Categorías elegibles (`aplicaEvaluacion`)

- **Propuesta actual:** *Aplicativos* (`Appliance` de GLPI: sistemas de negocio). **Hoy está vacía**, así que el módulo no tendría activos elegibles hasta que esos sistemas se registren en GLPI.
- **Excluidos:**
  - *Programas*: es el inventario de software instalado (componentes de Windows, controladores, utilidades). **No son sistemas que pasen a producción.**
  - Los equipos físicos.
- **[PREGUNTA]** ¿Se habilita *Servidores virtuales* mientras tanto? «VM-CONTABILIDAD» es hoy lo único que representa un sistema en producción. La alternativa es registrar los sistemas como *Appliance* en GLPI, que es lo recomendado.

## Permisos, auditoría e integración

- **Permisos [PROPUESTA]:**
  - admin y analista planifican, registran y cierran;
  - auditor solo consulta;
  - reabrir y corregir lo cerrado, solo admin con motivo.
- **Auditoría:** la común (`registro_cambio`), con valor anterior y nuevo, usuario y fecha, en la misma transacción.
- **Tablero:** contaría como pendiente lo ABIERTO o EN_PROGRESO.
- **Interfaz:** el patrón visual de Planificación de Mantenimientos.
- **Arquitectura:** un módulo NestJS independiente.

## Preguntas abiertas

1. ¿Campo «resultado» de las pruebas? ¿Un «No aprobado» impide cerrar o solo queda registrado?
2. ¿Bloquear o justificar las pruebas posteriores a la fecha programada?
3. ¿Fecha real de paso a producción?
4. ¿Servidores virtuales elegibles mientras *Aplicativos* esté vacía?

## Cambios necesarios para completar el módulo (no implementados)

Ni la fase 2 ni la corrección y la anulación están desarrolladas. Esto es lo que habría que hacer, tomando como plantilla el módulo de Renovaciones (`src/renewals`).

**1. Decisiones previas:** las preguntas abiertas de arriba. Hay que decidir si se añade un campo «resultado», si se bloquean o se justifican las pruebas tardías, si se registra la fecha real de paso a producción y si se añade «versión» al duplicado.

**2. Migración nueva** (no se modifica `20261029151000`). Solo `ADD COLUMN` que admiten nulos:

- `fechaPruebas DATETIME(3) NULL`: la fecha real de las pruebas, indicada por el usuario;
- `verificable VARCHAR(191) NULL` y `repositorioVerificable VARCHAR(500) NULL`;
- `observacionCierre TEXT NULL`;
- según lo que se decida: `resultado ENUM(...) NULL`, `fechaSolicitud DATETIME(3) NULL`, `fechaRealProduccion DATETIME(3) NULL` y `version VARCHAR(100) NULL`. Este último cambiaría el control de duplicados a «una pendiente por sistema y versión».

**3. API** (`src/production-evaluation`), con control de `version` y `TrazasService` en la misma transacción:

| Ruta | Quién | Regla |
|---|---|---|
| `PATCH /evaluaciones-sistemas/:id` | admin, analista | Corregir la planificación (fecha programada, responsable, descripción) con motivo; el sistema solo se cambia en ABIERTO y se vuelve a validar con `exigirOperativo(id, 'EVALUACION')` |
| `PATCH /:id/iniciar` | admin, analista | ABIERTO → EN_PROGRESO |
| `PATCH /:id/ejecucion` | admin, analista | Guardar los datos de la fase 2 sin cerrar |
| `PATCH /:id/cerrar` | admin, analista | Exige la fecha de las pruebas (no futura), el informe verificable y el repositorio. Si las pruebas son posteriores a la fecha programada, la observación, o el bloqueo si se decide así |
| `PATCH /:id/reabrir` | admin | CERRADO → EN_PROGRESO, con motivo |
| `POST /:id/anular` y `/reversar` | admin | Anulación lógica con motivo, y su reversión. Una anulada no bloquea una nueva planificación del mismo sistema |

**4. Web** (`features/evaluacion-sistemas`):

- ficha `/evaluacion-sistemas-productivos/:id` o pestaña «2 · Ejecución y cierre», con `shared/cierre/BloqueEjecucionCierre` y `ModalReabrir`;
- corrección y anulación según el permiso;
- la insignia «Vencida» se mantiene hasta el cierre.

**5. Panel de pendientes:** no cambia, porque `EN_PROGRESO` ya cuenta y las vencidas ya están incluidas.

**6. Pruebas:**

- e2e de cada ruta y de las reglas de fechas;
- permisos, versión y trazas;
- sonda de navegador del flujo completo.
