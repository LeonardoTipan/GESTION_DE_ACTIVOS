# Operaciones por módulo

Qué se puede hacer en cada módulo, quién puede hacerlo y qué reglas protegen los datos. Solo se listan los módulos que existen; los usuarios se gestionan en Keycloak, no en esta aplicación.

| Rol | Puede |
|---|---|
| **admin** | Todo, incluidas las anulaciones y sus reversiones |
| **analista** | Crear, modificar (con motivo) y registrar avances; no anula |
| **auditor** | Solo consultar, incluidas las trazas |

## Operaciones

| Módulo | Crear | Consultar | Modificar | Eliminar |
|---|---|---|---|---|
| **Activos** | admin, analista | todos | admin, analista | admin: **baja lógica**: queda *Dado de baja* y conserva ficha, historial y registros |
| **Categorías** y **criticidades** | admin | todos | admin | admin; **bloqueado** si algún activo las usa |
| **Respaldos** · plan, ejecución y restauración | admin, analista | todos | admin, analista, **con motivo** (versión nueva) | admin: **anular** (eliminación lógica, con motivo) y **revertir** |
| **Mantenimientos** · planificación y ejecución | admin, analista | todos | admin, analista, con motivo: plan (cualquier dato) y mantenimiento (tipo, actividad, inicio previsto y fecha límite, solo en fase Programado) | admin: anular y revertir (planificaciones y ejecuciones) |
| **Vulnerabilidades** · detección y remediación | admin, analista | todos | admin, analista, con motivo: fecha de detección, descripción, criticidad, responsable, CVE y plazo, solo mientras está pendiente; remediación cerrada: solo admin, con motivo | admin: anular y revertir |
| **Control de acceso** · solicitudes lógicas y físicas ([detalle](control-acceso.md)) | admin, analista | todos, incluido el historial | admin, analista: campos editables mientras no esté cerrada (cada cambio queda en el historial); pasar a pendiente y cerrar con la fecha atendida real. Corregir una cerrada y reabrir: solo admin, con motivo | No se eliminan; el historial no se modifica ni se borra |

Además, mantenimientos y vulnerabilidades avanzan por sus propias acciones (programar desde el plan, iniciar, finalizar, cancelar y verificar; iniciar la remediación, remediar con evidencia y reabrir). Todas las reglas se validan en la API: ocultar un botón en la interfaz no sustituye esa validación. Un registro anulado no admite ni modificaciones ni cambios de fase hasta que se revierta.

## Respaldos y restauración (A.8.13, A.5.30)

Diseñado según el prototipo de referencia, en tres pasos:

1. **Alcance (plan de respaldo).** Se seleccionan los activos operativos que aún no tienen plan (con un atajo para todos los críticos) y se fijan sus parámetros: frecuencia, tipo, medio, ventana, retención, frecuencia de prueba, RPO, RTO, responsable y justificación. Se crea un plan por activo. Un activo tiene como mucho un plan vigente. El activo de un plan no se cambia: se anula y se crea otro.
2. **Ejecución.** Cada corrida del respaldo sobre un plan vigente: fecha y hora reales (no futuras; fuera de la ventana del plan o antes de su inicio, solo como excepción de admin, ver *Plazos*), tipo, medio, volumen, duración, RPO, resultado, responsable y controles (cifrado, copia fuera de sitio, retención inmutable, integridad verificada).
3. **Restauración o prueba.** Sobre una ejecución no fallida ni anulada, con fecha posterior a ella: motivo, resultado, tiempo real frente al RTO, integridad, evidencia (acta o ticket) y observaciones. El motivo distingue la *prueba programada* (la que exige la frecuencia de prueba del plan) de las restauraciones reales por incidente o solicitud.

Las ejecuciones guardan además una **evidencia** (referencia documental) y **observaciones**; una ejecución fallida genera un aviso. Los tres listados se filtran por búsqueda, **categoría del activo**, responsable y, en ejecuciones y restauraciones, resultado y período, y se paginan.

Los **calendarios** despliegan las ventanas que corresponden a cada plan según su frecuencia (y su frecuencia de prueba). Cada ventana queda cumplida, vencida, en curso o programada; pulsarla carga el formulario con el plan y la fecha.

Los **indicadores** RES-00 a RES-07 se calculan para el período elegido, solo con registros vigentes (los anulados no cuentan):

| Indicador | Meta |
|---|---|
| RES-00 Cobertura del plan (activos críticos) | 100 % |
| RES-01b Ventanas programadas cubiertas | 95 % |
| RES-01 Tasa de éxito de respaldos | 98 % |
| RES-02 Respaldos cifrados | 100 % |
| RES-03 Activos críticos con esquema 3-2-1 | 100 % |
| RES-04 Ventanas de prueba con verificable | 100 % |
| RES-05 Restauraciones dentro del RTO | 100 % |
| RES-06 Tiempo medio de restauración | ≤ 180 min |
| RES-07 Respaldos con verificación de integridad | 100 % |

Son **críticos** los activos operativos con criticidad *Alta* o *Crítica* (variable `CRITICIDADES_CRITICAS`). Hoy los 27 equipos tienen criticidad *Media*, así que RES-00 y RES-03 salen "sin datos" hasta que se asigne la criticidad real.

Los **registros anteriores** (modelo de un solo registro con alcance, ejecución y prueba) se conservan intactos y solo se consultan (`/respaldos/anteriores`): les faltan datos obligatorios del plan y convertirlos obligaría a inventarlos.

## Mantenimientos en dos fases (A.7.13)

El módulo tiene **solo dos fases**, Planificación y Ejecución, cada una en su pestaña, más la de **Bitácoras**. No hay fase de verificación: completar una ejecución (con su verificable y repositorio) la cierra. El diseño completo (campos, semestres, cálculo de las bitácoras y auditoría) está en [mantenimiento.md](mantenimiento.md).

1. **Planificación.** Planificaciones por activo (se crean varias a la vez): tipo según la clase del activo (hardware: preventivo, correctivo, predictivo; software: preventivo, correctivo, perfectivo, adaptativo, evolutivo), **período** (única, mensual, trimestral, semestral, anual), **fecha de inicio planificada** (de ella salen el año y el semestre), asignado y descripción planificada. Un activo tiene como mucho **una planificación vigente por tipo**. *Nueva ejecución* crea la de la próxima fecha y adelanta el período, en una sola transacción con actualización condicional (dos clics simultáneos no duplican); *Adicional* crea otra en la fecha que se elija sin mover la próxima. El tablero muestra las intervenciones de los próximos 60 días, los activos operativos sin plan preventivo, los planes vencidos y los mantenimientos pendientes de verificar.
2. **Ejecución.** Toda ejecución nace de una planificación. Situación: Pendiente → En ejecución → Completado (o Cancelado, con motivo). Las **fechas reales** las indica el usuario (no se usa la hora del servidor); la fecha de registro es automática. Al completar se exigen la **persona encargada**, el **diagnóstico**, la descripción de la ejecución, la condición del equipo y la **duración**; el verificable y su repositorio (carpeta o URL http/https) son opcionales. Completar actualiza la *última revisión* del activo, con su entrada en la bitácora. Lo ejecutado se corrige con motivo (*Corregir ejecución*): en ejecución, admin y analista; completada, solo admin.

La **condición física** que trae GLPI (Bueno, Regular, Malo) no es un estado administrativo: un equipo en condición *Malo* sigue en el inventario y puede recibir planes y mantenimientos. Solo bloquean las operaciones nuevas la baja y los estados de `ESTADOS_NO_OPERATIVOS`.

## Vulnerabilidades en dos fases (A.8.8)

Solo dos fases sobre el **mismo registro**, sin fase de verificación. El diseño completo (matriz, campos, estados, auditoría) está en [vulnerabilidades.md](vulnerabilidades.md).

La aplicación **no tiene un escáner de vulnerabilidades conectado**: todo hallazgo se registra a mano.

1. **Detección.** Se registra en uno o varios activos de GLPI (uno por activo; todos o ninguno), en estado **Abierto**: fecha de detección (puede ser histórica), sistema, vulnerabilidad, criticidad (crítica, alta, media, baja) y responsable; CVE y plazo, opcionales. Una crítica genera un aviso.
2. **Remediación.** *Abierto → En progreso → Remediado*. Para marcarla **remediada** se exigen la **fecha real de remediación** (la indica el usuario; nunca la del servidor; no futura ni anterior a la detección), el **verificable** y su **repositorio** (carpeta o URL http/https). Se pueden guardar antes sin cerrarla. *Reabrir* (con motivo) la devuelve a *En progreso*, vacía la fecha vigente y genera un aviso.

El estado de una vulnerabilidad **no modifica el activo**. Cada paso queda en las trazas (alta, correcciones, cambios de estado, fecha de remediación, reapertura), con el usuario de la sesión y los valores anteriores y nuevos, en la misma transacción que el cambio.

## Plazos: lo previsto, lo real y lo verificado

Cada etapa de los tres módulos guarda por separado **lo previsto** (un intervalo [inicio, límite]) y **lo que ocurrió** (la fecha y hora reales). La fecha real nunca se copia de la prevista, y el plan nunca se corrige para que cuadre.

| Módulo | Capa 1 · previsto | Capa 2 · real (y su plazo) | Capa 3 · ventana propia |
|---|---|---|---|
| **Respaldos** | Inicio previsto del plan (`vigenteDesde`) y ventana horaria (nocturna 22–02, 00–04, fin de semana, laboral L–V 08–18, continua) | Fecha **y hora** real de cada ejecución | Prueba de restauración prevista [`pruebaPrevista`, `pruebaLimite`] de cada copia |
| **Mantenimientos** | Inicio previsto (`fecha`) y **fecha límite** (`fechaLimite`); en los planes, `plazoDias` (límite = inicio + plazo) | Inicio y fin reales | — (solo dos fases) |
| **Vulnerabilidades** | Detección (real, la registra una persona) y plazo de remediación (opcional) | Inicio real y **fecha real de remediación** | — (solo dos fases) |

En respaldos, la prueba de restauración **no** tiene que caber en el plazo de la ejecución: tiene su propio plazo y su propio estado.

**Fuera de plazo.** Si la fecha real cae fuera de lo previsto, la API responde 409 y pide una **excepción**: solo un **admin** la registra, con una justificación de al menos 20 caracteres. Se guardan `fueraDePlazo`, `motivoExcepcion` y `excepcionPor`, la fecha real queda como ocurrió y el plan no cambia. El analista ve el aviso y que no puede registrarla; el formulario no envía.

**Corregir una fecha ya registrada** (ejecución o restauración de respaldo) se reevalúa igual si la fecha (o el motivo) cambia. Si cae fuera, solo el admin la guarda, y el motivo del cambio queda como justificación. Si la corrección la devuelve al plan, deja de ser excepción (la anterior queda en las trazas).

**Ampliar un plazo** es una acción formal y solo de admin, con motivo:

- límite de ejecución del mantenimiento;
- límite de la prueba de restauración.

Se conserva el **límite original** (`fechaLimiteOriginal`) y el cambio queda en las trazas.

**Reprogramar una ventana de capa 3** (respaldos) que ya está programada también es mover el plan: solo admin.

**Otras reglas:**

- No se registra dos veces la misma ejecución de respaldo (mismo plan, misma fecha y hora).
- Una prueba **programada** de restauración exige que la copia tenga su prueba prevista, y solo hay una por copia.
- Una restauración por incidente no está programada y no se compara con ninguna ventana.
- Registrar una restauración documenta lo hecho; no recupera copias.

**Zona horaria: Guayaquil.** Toda la aplicación trabaja en la hora de la institución, `America/Guayaquil` (UTC−5, sin horario de verano), **sea cual sea la zona del equipo** del usuario. En la API se usa `ZONA_HORARIA`, o `GLPI_TIMEZONE`, o por defecto `America/Guayaquil`; en la interfaz, `VITE_ZONA_HORARIA` (por defecto la misma). La API evalúa las ventanas y los días en esa zona y guarda en UTC. La interfaz muestra, captura y compara las fechas en esa zona (`shared/zona.ts`): un «22:30» escrito en un formulario es 22:30 de Guayaquil aunque el navegador esté en otra zona. Los días de calendario sin hora (compra, última revisión, inicio de un plan de respaldo) se guardan a medianoche UTC y se leen tal cual, sin zona. Los avisos previos de la interfaz usan la misma regla que la API, pero quien decide es siempre la API.

### Calendarios

- Cada pestaña o paso de cada módulo tiene su calendario: capa 1, capa 2 y capa 3.
- **Calendario** (menú, `/calendario`) reúne los tres módulos, con selección de módulos y de capa.
- Vistas: mes, semana y día.
- Filtros: capa, categoría del activo, responsable y estado.
- En el móvil se muestra como lista por días.
- **Previsto** se dibuja con trazo discontinuo y **real** relleno. ⚠ marca lo registrado como excepción.
- Estados: programado, vencido, en curso, completado, fallido o no satisfactorio, cancelado.
- Al pulsar un evento se ven sus fechas y un enlace al registro. Las acciones se hacen en el registro, según el rol.
- En la planificación, «+» en un día crea desde esa fecha (solo admin y analista):
  - **Mantenimientos:** programa un mantenimiento de 08:00 a 18:00 de ese día.
  - **Respaldos:** fija el inicio previsto del plan nuevo.
- Los datos vienen de `GET /api/{respaldos|mantenimientos|vulnerabilidades}/agenda?desde&hasta[&capa&categoriaId&responsable&estado]`, calculados de lo guardado en la base.
- Cualquier cambio guardado recalcula los calendarios abiertos.

## Avisos

Además de los cambios de GLPI, la campana muestra los avisos de los módulos: respaldo fallido, mantenimiento no satisfactorio, vulnerabilidad crítica y vulnerabilidad reabierta. Se guardan en la tabla `notificacion` en la misma transacción que el hecho que los origina.

**Único canal: el aviso dentro de la aplicación.** No se envían correos ni mensajes. Para añadir el correo haría falta un servidor SMTP de la institución y un remitente autorizado, y un proceso que lea los avisos nuevos de `notificacion` y los envíe (así un fallo del correo no bloquea la operación).

## Limitaciones de las integraciones externas

- **Respaldos:** la aplicación **documenta** los respaldos; no los ejecuta ni guarda copias. Registrar una ejecución no prueba que exista el archivo: la evidencia es una referencia (registro del software de respaldo, ticket o acta) que alguien debe poder mostrar. No hay integración con un software de respaldo ni con el almacenamiento.
- **Vulnerabilidades:** sin escáner conectado (ver arriba).
- **Evidencias:** se guardan como referencia de texto; la aplicación no almacena archivos adjuntos.

## Indicadores de mantenimientos (A.7.13) y vulnerabilidades (A.8.8)

Con los campos que ya existen, sin añadir ninguno:

| Indicador | Meta |
|---|---|
| MAN-01 Realizados según lo programado | 95 % |
| MAN-02 Vencidos sin iniciar | 0 |
| MAN-03 Equipos operativos tras el mantenimiento | 100 % |
| MAN-04 Mantenimientos preventivos | 70 % |
| MAN-05 Duración media | ≤ 240 min |
| VUL-01 Críticas o altas abiertas | 0 |
| VUL-02 Fuera del plazo de remediación | 0 |
| VUL-03 Remediadas dentro del plazo (fecha real) | 100 % |
| VUL-04 Tiempo medio de remediación (fecha real − detección) | ≤ 30 días |

Las metas de MAN-04, MAN-05 y VUL-04 son valores de referencia propuestos: el prototipo no define estos módulos. Conviene validarlas con el responsable de seguridad.

## Versiones, anulación y trazas

- **Modificar** exige un motivo de 20 a 300 caracteres. Sube la versión del registro y guarda en las **trazas** qué campos cambiaron (valor anterior y nuevo), quién, cuándo y por qué. La columna *Reg.* muestra la versión (v1, v2…).
- **Anular** (solo admin) es una eliminación **lógica**: el registro se conserva, se ve tachado con su motivo, autor y fecha, y sale de los indicadores. **Revertir** lo devuelve. Ambas acciones quedan en las trazas.
- **No hay borrado físico** en respaldos, mantenimientos ni vulnerabilidades: los endpoints `DELETE` se retiraron.
- Las trazas se consultan en `GET /api/trazas?entidad=…&registroId=…` y desde el botón *Trazas* de cada registro.

## Estado del activo y equipos operativos

- **Estado** es el valor que informa GLPI (hoy *Bueno*, *Regular*, *Malo* o vacío). El filtro del inventario se construye con los valores que hay realmente (`GET /api/activos/estados`), con su recuento, así que un estado nuevo aparece solo.
- La **baja** se registra aparte del estado: baja manual en la aplicación, equipo en la papelera de GLPI o ya inexistente allí (lo detecta la sincronización). Un equipo dado de baja se muestra con el estado **Dado de baja** y su motivo, y se filtra con esa opción. Así un estado de GLPI no se confunde con una baja administrativa.
- **Operativo** es un equipo que no está dado de baja y cuyo estado no está en la lista `ESTADOS_NO_OPERATIVOS` (por defecto *Dado de baja, Inactivo, Desechado*, sin distinguir mayúsculas). *Malo* sí es operativo: es justo el equipo que necesita mantenimiento. Hoy GLPI no usa ninguno de esos tres estados, así que la lista empezará a actuar cuando se definan en GLPI.
- **Crear** un plan de respaldo, una ejecución, una restauración, un mantenimiento o una vulnerabilidad exige un equipo operativo. La interfaz solo los ofrece (`GET /api/activos?operativos=true`) y la API lo valida por su cuenta (400 con el motivo).
- Los registros que ya tenía un equipo que deja de ser operativo **se conservan**: se consultan, y los abiertos se pueden cerrar.

## Integridad

Las claves foráneas garantizan que todo registro apunta a un activo existente, y la base impide borrar físicamente un activo con registros. Si alguien vacía la tabla de activos saltándoselas, quedan **registros huérfanos**:

- Los listados y fichas los ignoran en lugar de fallar.
- La sincronización con GLPI se niega a escribir mientras existan (incluye las tablas de planes, ejecuciones y restauraciones).
- `docs/glpi-diagnostico.sql` (consulta 8) los localiza.
