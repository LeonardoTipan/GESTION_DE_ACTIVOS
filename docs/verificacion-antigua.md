# Retiro de la antigua fase de Verificación

Mantenimientos y Vulnerabilidades tenían una tercera fase independiente de **Verificación**. Hoy los dos tienen **dos fases**, y la evidencia se exige al cerrar.

Este documento hace inventario de los restos de esa fase, explica qué se retiró, qué se conserva y por qué, y describe la migración.

**No confundir con el flujo vigente.** Los campos **Verificable** (`evidencia`) y **Repositorio Verificable** (`repositorioVerificable`) de Mantenimiento, Vulnerabilidad y Renovación forman parte del cierre actual: no se tocaron. Tampoco se tocaron las trazas (`registro_cambio`), el historial de Control de acceso ni la verificación de integridad de Respaldos (`integridad`, `VERIFICACION_INTEGRIDAD`), que son de otro módulo.

## Evidencia reunida (27/10/2026)

**Consultas de solo lectura** (`SET SESSION TRANSACTION READ ONLY`) en `gestion_activos_db` (desarrollo) y `gestion_activos_test` (pruebas):

| Elemento | Desarrollo | Pruebas |
|---|---|---|
| `verificacion_mantenimiento` | **4 filas**, todas vigentes: 3 OPERATIVO y 1 REQUIERE_SEGUIMIENTO (mantenimientos 52, 53, 104 y 106) | 0 |
| `mantenimiento.verificacionPrevista` y `verificacionLimite` | **2 filas** (mantenimientos 52 y 53) | 0 |
| `registro_cambio` que cita esas columnas | **1** (traza 4, mantenimiento 53) | 0 |
| `verificacion_vulnerabilidad` | 0 | 0 |
| `accion_remediacion` | 0 | 0 |
| Columnas antiguas de `vulnerabilidad` (10) | 0 valores no nulos (de 2 filas) | 0 |
| Trazas con entidad `VERIFICACION_*` o `ACCION_REMEDIACION` | 0 | 0 |
| Avisos `MANTENIMIENTO_NO_SATISFACTORIO` | 0 | 0 |
| Claves foráneas que apuntan a las tablas antiguas | Ninguna | Ninguna |
| Vistas, rutinas y triggers | Ninguno | Ninguno |

**Búsqueda en el código:** en la web no queda ninguna llamada ni pantalla de la verificación antigua (`schema.d.ts` solo tenía los tipos generados). En la API quedaban los endpoints de mantenimiento, sin consumidor.

## Inventario y decisión

### Retirado: código obsoleto, sin datos afectados

| Elemento | Dónde | Evidencia |
|---|---|---|
| `GET` y `POST /api/mantenimientos/:id/verificaciones` y `POST /api/mantenimientos/verificaciones/:id/anular` | `planes-mantenimiento.controller.ts` | La web no los llama desde el cambio a dos fases (`18b1f41`) |
| `VerificacionesMantenimientoService` (registrar, listar, anular y aviso «no satisfactorio») | `planes-mantenimiento.service.ts`, `maintenance.module.ts` | Solo lo usaban esas rutas |
| `PATCH /api/mantenimientos/:id/verificacion-prevista` y `programarVerificacion()` | controlador y servicio de mantenimientos | La web no lo llama |
| Plazo `campo: 'VERIFICACION'` en `PATCH /:id/plazo` | `AmpliarPlazoMantenimientoDto` y `ampliarPlazo()` | La web solo envía `'EJECUCION'`, que se conserva |
| `verificacionPrevista` y `verificacionLimite` al finalizar | `FinalizarMantenimientoDto` y `finalizar()` | La web no los envía; ahora la API responde 400 si llegan |
| Campo calculado `cierre`, `cierreDe()` y el filtro `?cierre=` | `MantenimientoDto`, `frecuencia.ts`, `QueryMantenimientosDto` | La web no los lee |
| `pendientesVerificacion` del tablero | `TableroMantenimientosDto` y `tablero()` | La web no lo lee |
| `RegistrarVerificacionMantenimientoDto` y `VerificacionMantenimientoDto` | `planes/dto.ts` | Solo los usaban esas rutas |
| Entidades de auditoría `VERIFICACION_MANTENIMIENTO`, `ACCION_REMEDIACION` y `VERIFICACION_VULNERABILIDAD` | `trazas.service.ts` | No hay ninguna traza con ellas en ninguna base |
| Pruebas de la verificación antigua | `tres-capas` y `plazos-agenda` (e2e) | Se sustituyeron por pruebas de que ya no existe: 404, 400 y sin `cierre` |

### Retirado de la base: migración `20261027180000_retirar_verificacion_vulnerabilidades`

| Elemento | Evidencia |
|---|---|
| Tabla `accion_remediacion` y su clave foránea a `vulnerabilidad` | 0 filas; sin código desde `d92b2e7` |
| Tabla `verificacion_vulnerabilidad` y su clave foránea | 0 filas; sin código |
| Columnas de `vulnerabilidad`: `confirmadaEn`, `confirmadaPor`, `prioridad`, `planRemediacion`, `evaluadaEn`, `evaluadaPor`, `fechaLimiteOriginal`, `tratamientoPrevisto`, `verificacionPrevista` y `verificacionLimite` | Todas nulas; sin código. La `fechaLimiteOriginal` que sigue en uso es la de **mantenimiento**, y esa no se toca. |
| Enums `PrioridadVulnerabilidad` y `ResultadoVerificacionVulnerabilidad` | Solo los usaban esas columnas o tablas |

**Pérdida de información: ninguna** en desarrollo ni en pruebas. Para otros entornos, la migración empieza con una **salvaguarda**: si encuentra cualquier dato en lo que se elimina, se detiene con el error «Subquery returns more than 1 row» antes de borrar nada.

### Conservado

| Elemento | Motivo |
|---|---|
| Tabla `verificacion_mantenimiento` (modelo `VerificacionMantenimiento` y enum `ResultadoVerificacionMantenimiento`) | Guarda 4 verificaciones reales registradas por usuarios en desarrollo. Queda marcada como **histórica**, sin código que la lea ni la escriba. |
| Columnas `mantenimiento.verificacionPrevista` y `verificacionLimite` | Tienen datos en 2 mantenimientos, y una traza las cita. La API las sigue devolviendo en solo lectura, descritas como «Histórico». |
| Valor `MANTENIMIENTO_NO_SATISFACTORIO` del enum de avisos | Está en la tabla compartida `notificacion`. Quitarlo exige alterar esa columna sin ningún beneficio, y la web aún sabe mostrarlo. |
| `ProgramarVerificacionDto` (común) | Lo usa Respaldos para programar la prueba de restauración |
| `Capa` 3 en la agenda común | Respaldos la usa; la agenda de mantenimientos ya no devuelve eventos en ella |
| Verificable y Repositorio Verificable en los tres módulos | Son el cierre vigente |

## Decisión pendiente: los 4 registros históricos de mantenimiento

**A. Conservarlos tal cual** (es como queda ahora). La tabla y las 2 columnas se quedan en la base, sin uso.
- **Ventaja:** no se pierde nada.
- **Coste:** una tabla sin interfaz.

**B. Copiarlos y luego borrar la tabla y las columnas.**
1. Una migración copia cada verificación al historial auditado del mantenimiento: una traza `registro_cambio`, con su fecha, resultado, observaciones, evidencia, responsable y quién la registró.
2. Después elimina `verificacion_mantenimiento`, `verificacionPrevista` y `verificacionLimite`.
- **Ventaja:** limpia el esquema y la información sigue en las trazas de cada mantenimiento.
- **Requisitos:** respaldo verificado antes y una salvaguarda de conteo como la de esta migración.

**C. Exportarlos y luego borrar.** Se exporta un CSV a `C:\Users\adminqt\gestion-activos-respaldos` y luego se eliminan.
- **Desventaja:** la información sale de la aplicación.

**Recomendación: A ahora y B más adelante** (por ejemplo, junto con la Fase 5, antes de producción). Así se evita mezclar un cambio de datos con esta fusión.

## Cómo aplicar la migración en desarrollo

Se aplicó y probó en `gestion_activos_test` (19 migraciones, sin diferencias con el esquema). **En `gestion_activos_db` todavía no se aplicó.**

Hasta aplicarla, la API funciona igual: el cliente de Prisma no lee las columnas ni las tablas retiradas. Antes de fusionar conviene aplicarla con el procedimiento habitual:

```powershell
# 1. Respaldo y su verificación (como en las migraciones anteriores)
#    mysqldump → C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-retirar-verificacion-<fecha>.sql
#    restaurar en verif_respaldo_tmp, comparar conteos, DROP de la temporal
# 2. Pausar el sincronizador de GLPI
docker pause gestion-activos-glpi-sync
# 3. Aplicar (desde gestion-activos-api)
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # debe salir vacío
# 4. Reanudar
docker unpause gestion-activos-glpi-sync
```
