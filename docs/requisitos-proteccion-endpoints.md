# Protección de Endpoints · requisitos funcionales

**Estado (29/10/2026):** **fase 1 implementada** (sin commitear). La fase 2 sigue siendo especificación.

## Implementado · fase 1

- **Persistencia:** modelo `PeriodoEndpoint`, tabla `periodo_endpoint`, migración `20261029150000_proteccion_endpoints`. Está aplicada **solo en la base de pruebas**; en desarrollo y producción sigue pendiente (ver [categorias-aplicacion.md](categorias-aplicacion.md)).
  - Campos: `anio`, `mes`, `responsable`, `observacion` (opcional), `estado` (ABIERTO, EN_PROGRESO, CERRADO; nace ABIERTO), `version`, los de anulación lógica, `createdAt` y `updatedAt`.
  - Índice **único** `(anio, mes)` e índice por `estado`.
- **API** (módulo `src/endpoint-protection/`):
  - `GET /api/proteccion-endpoints/periodos?anio&estado&incluirAnulados&page&limit`: todos los roles. Ordena por año y mes descendentes y oculta los anulados salvo que se pidan.
  - `POST /api/proteccion-endpoints/periodos` (`anio`, `mes`, `responsable`, `observacion`): admin y analista.
    - 400 si el mes es futuro o si llegan campos de la fase 2 (lista blanca de los DTO).
    - 409 si el mes ya existe: «El período de {mes} de {año} ya existe (n.º X)».
    - Alta auditada (`registro_cambio`, entidad `PERIODO_ENDPOINT`) en la misma transacción.
- **Pantalla `/proteccion-endpoints`**, con el patrón de Planificación de Mantenimientos:
  - cifras «Equipos sujetos a control» (operativos con `aplicaEndpoint`), «Períodos abiertos» y «Meses sin período · año»;
  - paneles «Calendario · año» (los 12 meses con su situación) y «Equipos sujetos a control»;
  - sección «Períodos mensuales» con «Nueva planificación», filtros Año y Estado, y tabla paginada.
  - Modal: Año, Mes (los meses futuros aparecen deshabilitados), Asignado, Observación; Cancelar / «Abrir período».
- **Aún no:** la fase 2 (totales, Excel, cierre), y la corrección y la anulación (ver «Cambios necesarios» al final). Ya cuenta en el panel global de pendientes (`endpoints` en `GET /api/dashboard/pendientes`; ABIERTO + EN_PROGRESO, sin anulados).

Lo marcado **[PROPUESTA]** completa los requisitos del usuario y necesita aprobación. Lo marcado **[PREGUNTA]** necesita una decisión.

## Objetivo

Medir **cada mes** la cobertura de antivirus/EDR de los equipos: cuántos activos hay y cuántos tienen el antivirus. El soporte es el **Excel del inventario** de ese mes.

Sigue el patrón de dos fases sobre el **mismo registro**, como Renovaciones y Vulnerabilidades: no hay fase de verificación aparte y la evidencia se exige al cerrar.

## Unidad: el período mensual

- Un registro por **mes** (año y mes). No es un registro por activo.
- **No se duplica:** solo puede existir **un período por año y mes**.
  - **[PROPUESTA]** Índice **único** en la base sobre (año, mes), más la comprobación en el servicio, que responde 409 con un mensaje claro si el mes ya existe.
  - La interfaz no ofrece meses ya abiertos.
  - Los errores se corrigen sobre el mismo registro (corrección con motivo o reapertura), **no anulando y volviendo a crear**. Así el índice único no choca con la anulación lógica.

## Fase 1 · Apertura del mes

| Campo | Regla |
|---|---|
| Año y mes del período | Obligatorio. No futuro: se puede abrir el mes en curso o uno pasado (carga histórica). Único |
| Responsable | Obligatorio, texto (como en los demás módulos) |
| Observación | Opcional |
| Fecha de apertura | Automática (la del registro) y auditada. No es una fecha de negocio |

El período queda **ABIERTO**.

**[PROPUESTA]** Al abrir, la aplicación muestra como referencia el **número de activos elegibles hoy**: los operativos de categorías con `aplicaEndpoint`. No se guarda como dato del período, salvo que se apruebe guardarlo como «total de la aplicación».

## Fase 2 · Registro y cierre

| Campo | Regla |
|---|---|
| Total de activos | Entero ≥ 1. Total de equipos sujetos al control según el Excel del inventario |
| Equipos con antivirus | Entero ≥ 0 y **≤ total de activos** |
| Fecha de corte del inventario | Fecha **real** del Excel, indicada por el usuario (nunca la del servidor). Dentro del mes del período o en los primeros días del siguiente **[PREGUNTA: margen]**. No futura |
| Verificable | **Obligatorio para cerrar:** nombre del Excel del inventario |
| Repositorio verificable | **Obligatorio para cerrar:** carpeta o URL http(s), con la misma validación que los demás módulos. La aplicación no guarda archivos |
| Observación | Obligatoria si se cumple alguna regla de coherencia «con justificación» (ver abajo) |

**Estados:** ABIERTO → EN_PROGRESO (al guardar datos sin cerrar) → **CERRADO**. Se puede guardar sin cerrar. El mensaje de cierre dice qué falta.

**Calculado, no guardado:** cobertura = equipos con antivirus ÷ total × 100, y equipos sin antivirus = total − con antivirus.

## Coherencia de los totales

1. **Equipos con antivirus ≤ total de activos**, siempre (400).
2. **Contraste con la aplicación [PROPUESTA].** Si el total del Excel difiere del número de activos elegibles (operativos con `aplicaEndpoint`) en más de un margen **[PREGUNTA: margen]**, el cierre exige una justificación en la observación. Por ejemplo: equipos aún no sincronizados desde GLPI.
3. **Contraste con el mes anterior [PROPUESTA].** Si el total varía más de un porcentaje **[PREGUNTA]** respecto al período anterior cerrado, se pide justificación. Solo es un aviso; no bloquea sin justificación.
4. **Cifras cerradas.** Una vez cerrado, solo un admin las corrige, con motivo y auditoría: valor anterior y nuevo, usuario y fecha, en la misma transacción.

## Categorías elegibles (`aplicaEndpoint`)

- **Propuesta actual:** *Computadoras* (26 portátiles y equipos de escritorio).
- **[PREGUNTA]** ¿Entran *Servidores físicos* y *Servidores virtuales* en la misma métrica, o tienen otra política (EDR de servidor)? Si se mide aparte, haría falta un desglose por categoría.
- **Dato útil:** el inventario de GLPI muestra «ESET Endpoint Security» y «ESET Management Agent» en *Programas*. Ese catálogo no indica en qué equipo está instalado cada programa, así que **hoy la aplicación no puede contar los equipos con antivirus por sí misma**: el número viene del Excel.

## Permisos, auditoría e integración

- **Permisos [PROPUESTA]:**
  - admin y analista abren, registran y cierran;
  - auditor solo consulta;
  - reabrir y corregir lo cerrado, solo admin con motivo.
- **Auditoría:** la común (`registro_cambio`), con el usuario de la sesión y en la misma transacción.
- **Tablero:** contaría como pendiente un período ABIERTO o EN_PROGRESO.
- **Interfaz:** el patrón visual de Planificación de Mantenimientos (cifras → paneles → sección → filtros → tabla).
- **Arquitectura:** un módulo NestJS independiente que solo use `ActivosService` para el recuento de elegibles.

## Preguntas abiertas

1. ¿Los servidores entran en la métrica? ¿Con desglose?
2. ¿Qué margen admite la fecha de corte? ¿Y la diferencia entre el total del Excel y el de la aplicación?
3. ¿Se guarda el «total según la aplicación» de cada mes para el histórico?
4. ¿Hace falta registrar **qué** equipos no tienen antivirus (lista), o basta con las cifras?
5. ¿Se puede abrir un mes si el anterior no está cerrado?

## Cambios necesarios para completar el módulo (no implementados)

Ni la fase 2 ni la corrección y la anulación están desarrolladas. Esto es lo que habría que hacer, tomando como plantilla el módulo de Renovaciones (`src/renewals`), que ya tiene todas esas operaciones.

**1. Migración nueva** (no se modifica `20261029150000`). Solo `ADD COLUMN` que admiten nulos, compatibles con los períodos ya abiertos:

- `totalActivos INT NULL`;
- `equiposConAntivirus INT NULL`;
- `fechaCorte DATE NULL`: la fecha real del Excel;
- `verificable VARCHAR(191) NULL` y `repositorioVerificable VARCHAR(500) NULL`;
- `totalAplicacion INT NULL`, solo si se aprueba guardar el «total según la aplicación».

**2. API** (`src/endpoint-protection`), con control de `version` y auditoría en la misma transacción (`TrazasService.modificar`, `anular` y `reversar`), como Renovaciones:

| Ruta | Quién | Regla |
|---|---|---|
| `PATCH /periodos/:id` | admin, analista | Corregir la planificación (responsable, observación) con motivo. Año y mes **no** se cambian; si están mal, se anula |
| `PATCH /periodos/:id/registro` | admin, analista | Guardar los datos de la fase 2 sin cerrar → `EN_PROGRESO` |
| `PATCH /periodos/:id/cerrar` | admin, analista | Exige total ≥ 1, `equiposConAntivirus` ≤ total, fecha de corte válida, verificable y repositorio (validación común de `common/evidencia/repositorio.ts`). Si una regla de coherencia lo pide, exige la justificación en la observación |
| `PATCH /periodos/:id/reabrir` | admin | CERRADO → EN_PROGRESO, con motivo |
| `POST /periodos/:id/anular` y `/reversar` | admin | Anulación lógica con motivo, y su reversión |

**Decisión previa necesaria.** El índice único `(anio, mes)` sigue ocupado por un período **anulado**. Hay dos opciones:

- **(a)** Un mes anulado no se puede volver a abrir: se revierte la anulación y se corrige.
- **(b)** El índice pasa a ser único solo entre los no anulados. Eso exige otra migración (columna generada o índice funcional).

La recomendada es **(a)**, que ya está en la especificación: «los errores se corrigen sobre el mismo registro».

**DECIDIDO por el usuario (29/10/2026): opción (a).** Un mes anulado **no** se puede volver a abrir desde cero. Si hubo un error, se **revierte la anulación** (`POST /periodos/:id/reversar`, con motivo) para conservar el registro, y luego se corrige. El índice único `(anio, mes)` no cambia. Al abrir un mes que tiene un período anulado, el 409 debe decirlo y remitir a «revertir la anulación».

**3. Web** (`features/proteccion-endpoints`):

- pestaña «2 · Registro y cierre» o ficha `/proteccion-endpoints/:id`, con `shared/cierre/BloqueEjecucionCierre` (evidencia, guardar sin cerrar, cerrar) y `ModalReabrir`;
- cobertura y equipos sin antivirus **calculados**, no guardados;
- acciones de corrección y anulación solo para quien tenga permiso (`usePuedeOperar` y `usePuedeAdministrar`);
- invalidación en `onSettled`, como en la fase 1.

**4. Panel de pendientes:** no cambia, porque `EN_PROGRESO` ya cuenta.

**5. Pruebas:**

- e2e de cada ruta: 400 y 409 de las reglas, 403 del auditor, conflicto de versión, trazas con valor anterior y nuevo;
- unitarias de la coherencia de los totales;
- sonda de navegador del flujo completo.
