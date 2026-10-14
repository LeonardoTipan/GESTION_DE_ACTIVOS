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
| **Mantenimientos** | admin, analista | todos | admin, analista, con motivo: tipo, actividad y fecha, solo en fase Programado | admin: anular y revertir |
| **Vulnerabilidades** | admin, analista | todos | admin, analista, con motivo: CVE, descripción, riesgo y fechas, solo mientras está pendiente | admin: anular y revertir |

Además, mantenimientos y vulnerabilidades avanzan por sus propias acciones (iniciar, finalizar y cancelar; iniciar mitigación, mitigar y aceptar riesgo). Un registro anulado no admite ni modificaciones ni cambios de fase hasta que se revierta.

## Respaldos y restauración (A.8.13, A.5.30)

Diseñado según el prototipo de referencia, en tres pasos:

1. **Alcance (plan de respaldo).** Se seleccionan los activos operativos que aún no tienen plan (con un atajo para todos los críticos) y se fijan sus parámetros: frecuencia, tipo, medio, ventana, retención, frecuencia de prueba, RPO, RTO, responsable y justificación. Se crea un plan por activo. Un activo tiene como mucho un plan vigente. El activo de un plan no se cambia: se anula y se crea otro.
2. **Ejecución.** Cada corrida del respaldo sobre un plan vigente: fecha (no futura), tipo, medio, volumen, duración, RPO, resultado, responsable y controles (cifrado, copia fuera de sitio, retención inmutable, integridad verificada).
3. **Restauración o prueba.** Sobre una ejecución no fallida ni anulada, con fecha posterior a ella: motivo, resultado, tiempo real frente al RTO, integridad y evidencia (acta o ticket).

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
| VUL-03 Mitigadas dentro del plazo | 100 % |
| VUL-04 Tiempo medio de mitigación | ≤ 30 días |

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
