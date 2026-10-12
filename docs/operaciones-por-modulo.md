# Operaciones por módulo

Qué se puede hacer en cada módulo, quién puede hacerlo y qué reglas protegen los datos. Solo se listan los módulos que existen; los usuarios se gestionan en Keycloak, no en esta aplicación.

| Rol | Puede |
|---|---|
| **admin** | Todo, incluidas las eliminaciones |
| **analista** | Crear, editar y registrar avances; no elimina |
| **auditor** | Solo consultar |

## Operaciones

| Módulo | Crear | Consultar | Editar | Eliminar |
|---|---|---|---|---|
| **Activos** | admin, analista | todos | admin, analista | admin: **baja lógica** (conserva historial y registros asociados) |
| **Categorías** y **criticidades** | admin | todos | admin | admin; **bloqueado** si algún activo las usa |
| **Respaldos** | admin, analista | todos | admin, analista: el alcance, solo con la ejecución pendiente | admin: borrado definitivo |
| **Mantenimientos** | admin, analista | todos | admin, analista: tipo, actividad y fecha, solo en fase Programado | admin: borrado definitivo |
| **Vulnerabilidades** | admin, analista | todos | admin, analista: CVE, descripción, riesgo y fechas, solo mientras está pendiente | admin: borrado definitivo |

Además, respaldos, mantenimientos y vulnerabilidades avanzan por sus propias acciones (registrar ejecución y prueba; iniciar, finalizar y cancelar; iniciar mitigación, mitigar y aceptar riesgo).

## Política de eliminación

- **Activos: nunca se borran físicamente.** "Dar de baja" los oculta del inventario pero conserva su historial, sus respaldos, sus mantenimientos y sus vulnerabilidades, que siguen consultables. La base de datos impide además el borrado físico de un activo con registros (clave foránea).
- **Respaldos, mantenimientos y vulnerabilidades:** el administrador puede borrarlos definitivamente, en cualquier estado, tras una confirmación. No afecta al activo. Para anular un mantenimiento conservando el registro existe **Cancelar**.
- **Catálogos:** una categoría o criticidad asignada a algún activo (incluidos los dados de baja) no se puede eliminar; la API responde con un error claro.
- **Edición limitada al estado abierto:** un respaldo ejecutado, un mantenimiento iniciado o una vulnerabilidad cerrada son evidencia y ya no se editan.

## Integridad

Las claves foráneas garantizan que todo respaldo, mantenimiento, vulnerabilidad y entrada de historial apunta a un activo existente. Si alguien vacía la tabla de activos saltándoselas, quedan **registros huérfanos**:

- Los listados y fichas de esos módulos los ignoran en lugar de fallar.
- La sincronización con GLPI se niega a escribir mientras existan.
- `docs/glpi-diagnostico.sql` (consulta 8) los localiza.
