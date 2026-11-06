# Bitácoras institucionales y corrección de Vulnerabilidades (06/11/2026)

Referencia funcional: «Indicadores de seguimiento de Tecnología.xlsx» (OneDrive, 22/10/2026). La copia de Descargas tiene el
mismo contenido; solo cambia el orden de las hojas. El libro es una plantilla de 2026: no trae datos ni fórmulas de celda.

## 1. Indicadores del Excel y cómo se calculan

Todas las cifras se calculan en el backend, sin registros anulados. Si no hay denominador, el resultado es «N/D», nunca 0 %. Los
períodos futuros quedan sin cifras. Las filas informativas acompañan al indicador, pero no forman parte de la fórmula.

| Módulo | Indicador (Excel) | Frecuencia | Numerador | Denominador | Ruta |
|---|---|---|---|---|---|
| Respaldos | Ejecución de respaldo y restauración | Mensual | Ventanas programadas cubiertas por una ejecución **EXITOSA** | Ventanas exigibles del mes (terminadas o ya cubiertas), de los planes vigentes **en ese momento**; cada ventana cuenta en el mes en que termina | `GET /respaldos/bitacora/general` |
| Control de acceso | Índice de control de acceso | Mensual | Solicitudes de **alta** del mes, cerradas | Solicitudes de **alta** del mes (por fecha de solicitud) | `GET /control-acceso/bitacora/general` |
| Mantenimientos | Ejecución del plan de mantenimiento tecnológico | Semestral | Planificaciones con al menos una ejecución FINALIZADA | Planificaciones del semestre planificado, sin las suspendidas sin ejecución | `GET /mantenimientos/bitacora/indicador` |
| Vulnerabilidades | Tasa de remediación de vulnerabilidades | Trimestral | De las pendientes en el trimestre, las REMEDIADAS con la fecha real dentro de él | Pendientes en algún momento del trimestre: detectadas antes de su fin y no remediadas antes de su inicio | `GET /vulnerabilidades/bitacora/general` |
| Protección de Endpoints | Cobertura de protección endpoint y antivirus | Mensual | Equipos con antivirus del período CERRADO | Equipos del período cerrado (fotografía al abrirlo), o los totales anteriores sin detalle | `GET /proteccion-endpoints/periodos/bitacora/general` |
| Evaluación de Sistemas Productivos | Nivel de evaluación de seguridad | Semestral | Sistemas **distintos** del total con una evaluación CERRADA cuyas pruebas reales son del semestre | Sistemas en producción al cierre del semestre (o hoy, si está en curso), reconstruidos con las fechas del inventario | `GET /evaluaciones-sistemas/bitacora/indicador` |

**Filas informativas:**
- **Respaldos:** pruebas de restauración exitosas, ejecuciones fallidas o parciales y ventanas aún en curso.
- **Control de acceso:** altas pendientes, solicitudes de baja y bajas atendidas.
- **Mantenimientos:** planificadas, suspendidas, ejecuciones finalizadas y ejecuciones sin planificación.
- **Vulnerabilidades:** detectadas en el trimestre, pendientes al cierre y remediadas fuera de plazo.
- **Endpoints:** equipos sin antivirus y equipos por registrar.
- **Evaluación:** evaluaciones cerradas y planificadas, planificadas sin ejecutar y sistemas evaluados fuera del inventario de producción.

**Decisiones del 06/11/2026:**
- **Respaldos:** opción A (ventanas cubiertas con una ejecución exitosa); las pruebas de restauración van aparte.
- **Vulnerabilidades:** opción A (arrastre de pendientes).
- **Evaluación:** opción A (reconstrucción con el inventario, sin migración).
- **Mantenimientos:** se mantiene el descuento de las suspendidas.
- **Control de acceso:** solo las altas; las bajas, aparte.

### Bitácoras operativas (el Excel no define indicador)

| Módulo | Contenido | Ruta |
|---|---|---|
| Renovaciones | Renovaciones registradas o ejecutadas en el período: caducidad anterior, fecha real, nueva caducidad, responsable, estado y evidencia | `GET /renovaciones/bitacora` |
| Inventario | Movimientos (alta, modificación, baja, inactivación y reactivación) con los valores anterior y nuevo, el usuario y el origen (manual o sincronización GLPI) | `GET /activos/bitacora` |

## 2. Bitácoras específicas

| Módulo | Qué justifica cada cifra |
|---|---|
| Respaldos | Una fila por ventana programada: la ejecución que la valida (o la última registrada, con su resultado) y, aparte, su prueba de restauración (resultado, fecha de aprobación y acta) (`GET /respaldos/bitacora/especifica`) |
| Control de acceso | Las solicitudes del mes y cómo cuenta cada una: Otorgado, Pendiente o Baja, aparte (`GET /control-acceso/bitacora/especifica`) |
| Mantenimientos | La específica que ya existía (planificado frente a ejecutado) |
| Vulnerabilidades | El total identificado del trimestre y si cada una cuenta como remediada (`GET /vulnerabilidades/bitacora/especifica`) |
| Protección de Endpoints | Los equipos del período del mes elegido, con su marca y su historial por equipo (auditoría «Equipo CÓDIGO») |
| Evaluación | Los sistemas en producción del semestre y si se evaluaron (`GET /evaluaciones-sistemas/bitacora/sistemas`). Las evaluaciones se filtran por fecha planificada o por fecha real de pruebas (`segun=PRUEBAS`, que es exactamente el numerador) |

Todas las bitácoras son de consulta: no hay acciones de modificación. Las correcciones se hacen desde la ficha del registro y quedan
en la auditoría.

## 3. Interfaz

- **Ubicación de la Bitácora:**
  - **Pestaña nueva:** en Vulnerabilidades, Control de acceso, Renovaciones e Inventario («Bitácora de movimientos»).
  - **Respaldos:** un paso nuevo en su barra de pasos.
  - **Mantenimientos, Endpoints y Evaluación:** su Bitácora usa ahora la tabla común.
- **Tabla común:** el formato es el del Excel: una columna por mes, trimestre o semestre, con el período en curso marcado. Muestra numerador, denominador, cumplimiento y la variación con el período anterior. Al pulsar un período, la Bitácora Específica muestra sus registros.
- **Componentes compartidos:** `shared/bitacora/` (`BitacoraGeneral`, `SelectorAnioBitacora`, `CampoBusqueda` y las funciones de `bitacora.ts`).

## 4. Corrección de Vulnerabilidades

**Diagnóstico:** el backend ya guardaba bien el estado, la fecha real, la evidencia y la auditoría, en una sola transacción. Las tres
vulnerabilidades de desarrollo eran coherentes.

**Causas del comportamiento observado y su corrección:**
1. **Las remediadas desaparecían:** «2 · Remediación» solo listaba las pendientes y no había ningún apartado de remediadas. Ahora tiene el selector **Pendientes | Remediadas | Todas**, guardado en la URL (`vista`), y existe la pestaña **Bitácora**.
2. **Una fecha guardada parecía una remediación:** «Guardar sin cerrar» admite la fecha de remediación y el listado la mostraba como remediada. Ahora se marca **«Guardada, sin cerrar»**, y el estado, no la fecha, decide si cuenta como remediada.
3. **El formulario podía quedar desactualizado:** ahora se reinicia con cada versión del registro, el mismo arreglo que se aplicó en Endpoints.
4. **El panel no se refrescaba:** Vulnerabilidades no lo invalidaba al guardar; ahora invalida el panel y el calendario. Respaldos, Control de acceso y Renovaciones invalidan también el panel.
5. **«Quitar filtros»** ya no saca de la pestaña ni de la vista en que se está.

**Condición física del activo:** es el `estado` que trae GLPI (Bueno, Regular o Malo) y la sincronización aplica las diferencias.
Vulnerabilidades no lo cambia; la ficha lo muestra en solo lectura, como «informada por GLPI».

## 5. Cambios de comportamiento y limitaciones

- **Evaluación:** la Bitácora General ya no muestra «cerradas ÷ planificadas», sino la fórmula del Excel; las planificadas pasan a ser una fila informativa.
- **Control de acceso:** una solicitud denegada se cierra igual que una otorgada, así que cuenta como otorgada. No hay campo para distinguirlas y no se ha añadido.
- **Evaluación:**
  - La categoría y el estado de GLPI se toman como están hoy; solo las fechas de alta, baja e inactivación se reconstruyen.
  - El alta usa la fecha de alta de GLPI y, si no existe, la de registro local.
- **Respaldos:** la vigencia de cada plan se reconstruye desde su auditoría (VIGENTE ⇄ SUSPENDIDO). Una semana que cruza de año se recorta en cada año, como en el tablero.
- **Inventario:** la baja manual no registra motivo (solo la inactivación de GLPI lo trae); se muestra «No registrado».
- **Vulnerabilidades:** una reabierta deja de contar como remediada en su trimestre; la remediación anterior queda en la auditoría.
- **Migraciones:** ninguna. No se modificó ninguna migración ni la sincronización con GLPI.

## 6. Pruebas (06/11/2026)

| Prueba | Resultado |
|---|---|
| API, unitarias | 309 de 309; las nuevas cubren el cálculo de cada bitácora: períodos, N/D, futuros, anulados, arrastre, vigencias y fotografía |
| API, e2e completa (una sola ejecución, 513 s) | 399 de 399 en 26 archivos. Cinco suites nuevas: `bitacora-vulnerabilidades` (los 12 pasos del caso controlado), `bitacora-respaldos`, `bitacora-control-acceso`, `bitacoras-indicadores` y `bitacoras-operativas` |
| Web, unitarias | 148 de 148 |
| Lint, `tsc` y compilación | Correctos. El lint no tiene avisos nuevos: los que quedan son anteriores, de la sincronización y de dos suites antiguas |
| Navegador, base de pruebas (`nav/p44`): Vulnerabilidades | 22 de 22: remediación sin F5, vistas, Bitácora, historial, condición GLPI, panel y auditor |
| Navegador, base de pruebas (`nav/p45`): las ocho bitácoras | 107 de 107 con tres perfiles, sin escrituras ni errores; el auditor sin acciones; 375 px sin desbordamiento |
| Desarrollo (solo GET) | Todas las rutas nuevas responden 200 |
| GLPI | Sin cambios en la sincronización; el contenedor sigue con sus ciclos |

**Cambio de prueba existente:** `filtros-url.test.ts` de Vulnerabilidades. Ahora comprueba el selector aprobado (Pendientes,
Remediadas y Todas) en lugar del filtro por estado de la pestaña Remediación.
