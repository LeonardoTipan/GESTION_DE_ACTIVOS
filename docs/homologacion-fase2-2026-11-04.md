# Homologación de la fase 2: evidencia obligatoria y recálculo (04/11/2026)

Decisiones aprobadas por el usuario.

## 1. Evidencia obligatoria en Mantenimientos

- **Regla:** para completar una ejecución hacen falta el **verificable** (`evidencia`) y el **repositorio del verificable** (`repositorioVerificable`). La aplica el backend (`exigirEvidenciaDeCierre` en `maintenance/planificacion.ts`), no solo la interfaz.
- **Se rechaza con 400:** valores vacíos, solo espacios, campos omitidos en la petición y repositorios con formato no válido.
- **Se valida el resultado:** cuenta lo enviado o, si no se envía, lo ya guardado durante la ejecución.
- **Corrección de una completada (solo admin):** debe quedar con su evidencia.
- **Históricas sin evidencia:** se conservan y se consultan sin cambios. Corregirlas exige completarlas en esa misma corrección. En desarrollo son las ejecuciones **#104 y #106**.
- **Ejecución en curso:** se puede corregir sin evidencia, porque la regla se exige al cerrar.
- **Control de Acceso:** no exige evidencia documental. No cambia.

## 2. Recálculo de los planes #1, #2 y #52 en desarrollo

| Plan | Periodicidad | Último fin real | Próxima anterior | Próxima nueva |
|---|---|---|---|---|
| #1 | Semestral | 28/10/2026 10:20:00 (ejecución #105) | 22/04/2027 08:00:00 | **28/04/2027 10:20:00** |
| #2 | Trimestral | 28/10/2026 10:18:07 (ejecución #154) | 21/01/2027 14:00:00 | **28/01/2027 10:18:07** |
| #52 | Trimestral | Ninguno | 27/03/2026 08:00:00 | Sin modificar |

- **#52 no se recalculó** porque no tiene ninguna ejecución finalizada válida. Sigue figurando como vencido (`planesVencidos` = 1). Si se cambia su período o su fecha de inicio, la regla vigente lo llevará a su fecha de inicio (01/01/2026), porque sigue sin ejecuciones.
- **Método:** `UPDATE` directo de `proximaFecha` en una transacción, condicionado al valor anterior. No cambia `version` ni `updatedAt`, y **no deja traza en `registro_cambio`**: este documento es el registro del cambio.

### Respaldo

`C:\Users\adminqt\gestion-activos-respaldos\gestion_activos_db-antes-recalculo-planes-20261104-095508.sql`

- 1 163 829 bytes, «Dump completed».
- SHA-256 `96029aa5cbaac258193fd2e4a2f4bd22950f084b606be839bd217b79ddbb3a35`.
- Tomado con el backend y glpi-sync pausados.
- Restaurado en una base temporal, ya borrada: 22 de 22 tablas idénticas con `CHECKSUM TABLE`.

### Comprobación

- **`CHECKSUM TABLE` antes y después, con los servicios pausados:** 21 de 22 tablas iguales. Solo cambió `plan_mantenimiento`.
- **Comparación por campo:** solo cambió `proximaFecha` de #1 y #2. La fila de #52, el período de Endpoints #1 y la evaluación #1 quedaron iguales.
- **Después de reanudar los servicios:** solo cambió `sincronizacion`, la tabla donde escribe el ciclo de glpi-sync. Los planes, el período #1 y la evaluación #1 siguen iguales.

## 3. Regla vigente

- El fin real determina la próxima intervención, y el calendario la muestra.
- El usuario crea la ejecución con `+ Nueva ejecución`; no se crean ejecuciones futuras automáticamente.
- Hay una sola ejecución pendiente por plan, salvo las adicionales justificadas.
