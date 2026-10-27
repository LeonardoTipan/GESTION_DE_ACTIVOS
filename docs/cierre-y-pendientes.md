# Cierre compartido y pendientes del tablero

Este documento cubre dos cambios independientes:

- **A. Refactorización visual.** Una sola presentación para la ejecución y el cierre de Control de acceso, Mantenimientos, Vulnerabilidades y Renovaciones. **No cambia ninguna regla** de los módulos.
- **B. Resumen del tablero.** Un endpoint que cuenta los trámites pendientes de esos cuatro módulos y su uso en la pantalla de inicio.

## A. Componente compartido de ejecución y cierre

### Qué se comparte

Está en `gestion-activos-web/src/shared/cierre/`:

| Pieza | Responsabilidad |
|---|---|
| `BloqueEjecucionCierre` | Presenta la evidencia (Verificable y Repositorio verificable), la Observación y el Motivo del cambio de una corrección, y la botonera Volver / Guardar / Cerrar. |
| `Dato` | Muestra un dato de solo lectura (etiqueta y valor). |
| `EnlaceRepositorio` | Si el repositorio es una URL http(s), lo muestra como enlace; si es una carpeta, como texto. |
| `ModalReabrir` | Pide un motivo obligatorio para reabrir, con la regla de validación de cada módulo. |
| `avisos.ts` | Avisos de éxito y de error. |

**Reglas del bloque:**

- **Solo presenta.** Recibe por props los valores, cambios y errores que ya maneja el formulario del módulo (`form.getInputProps(...)`), además de las acciones.
- **Lo demás queda en el módulo:** la validación, los mensajes de faltantes, la conversión de fechas y las llamadas a la API.
- **No conoce ningún modelo ni endpoint.**
- **Nunca rellena una fecha.** La fecha real es un campo propio de cada módulo y la escribe el usuario.
- **Evita envíos duplicados.** Mientras Guardar o Cerrar está en curso, el otro botón y Volver quedan deshabilitados. Antes solo se deshabilitaba el botón pulsado.
- **Guardar** siempre envía el formulario.
- **Cerrar** envía el formulario, o ejecuta su propia acción si el módulo le pasa `onClick` (por ejemplo, para comprobar antes lo que falta).

### Cómo lo usa cada módulo

| Módulo | Dónde | Campos propios (se conservan) | Del bloque |
|---|---|---|---|
| Control de acceso | `CerrarModal`, reapertura | Fecha atendida (fecha y hora; no futura ni anterior a la solicitud), resolución, texto ALTA/BAJA | Volver y «Cerrar solicitud». **Sin** verificable, repositorio ni observación: la solicitud no los tiene. Reabrir: `ModalReabrir` con su regla (20–2000 caracteres) y su etiqueta «Motivo de la reapertura». |
| Mantenimientos | `FinalizarModal` | Condición del equipo, persona encargada, duración, costo, diagnóstico, descripción, repuestos, fecha real de finalización, excepción fuera de plazo | Verificable, «Repositorio del verificable», observación, Volver y «Marcar como completado» (una sola petición, sin «guardar sin cerrar»). |
| Mantenimientos | `CorregirEjecucionModal` | Fechas reales, persona, tipo ejecutado, condición, descripción (si está completada) | Evidencia, observación, motivo del cambio, Volver y «Guardar corrección» (deshabilitado sin cambios). |
| Vulnerabilidades | `Remediacion` | Fecha de remediación (fecha y hora; no anterior a la detección), inicio de la remediación, SLA | Evidencia, observación, motivo de corrección, «Guardar sin cerrar» y «Marcar como remediada». Reabrir: `ModalReabrir`. |
| Renovaciones | `Ejecucion` | Fecha real de renovación (día), **nueva fecha de caducidad**, «sin caducidad» y descripción | Evidencia, observación, motivo de corrección, «Guardar sin cerrar» y «Cerrar renovación». Reabrir: `ModalReabrir`. |

`Dato` y `EnlaceRepositorio` reemplazan las copias que había en `Remediacion`, `Ejecucion`, `ControlAccesoDetallePage`, `MantenimientoPage`, `VulnerabilidadPage` y `RenovacionPage`.

### Diferencias que se conservaron

- **Tipos de fecha distintos.** Renovaciones usa días; los otros tres módulos, fecha y hora. Por eso la fecha no está en el bloque.
- **Mantenimiento cierra en una sola petición.** No tiene «guardar sin cerrar».
- **Control de acceso no tiene evidencia.** Su cierre consiste en la fecha atendida y la resolución.
- **Las reglas de motivo son distintas:**
  - corrección: 20–300 caracteres;
  - reapertura de Control de acceso: 20–2000 caracteres.
- **Textos de cada módulo:** etiquetas («Repositorio del verificable» en mantenimiento), descripciones, ejemplos y mensajes.
- **Sin cambios** en las rutas, los formatos de petición, los nombres de campo ni los contratos de la API.

### Cambios visibles

- **Vulnerabilidades:** el verificable y el repositorio ahora están en la misma fila. Antes el verificable iba junto a la fecha.
- **Mantenimientos (completar):** el verificable y el repositorio ahora están en la misma fila, debajo de la fecha.
- **Mantenimientos (ficha):** los textos largos respetan los saltos de línea, porque ahora usa el `Dato` común.

## B. Pendientes para el tablero

### Contrato

`GET /api/dashboard/pendientes`. Requiere sesión. Lo consultan los roles admin, analista y auditor.

```json
{ "accesos": 3, "mantenimientos": 1, "vulnerabilidades": 0, "renovaciones": 2, "total": 6 }
```

- **Formato de la respuesta:** un objeto plano, como el resto de respuestas de la API, sin envoltorio. En Swagger aparece como `PendientesTableroDto`. No se llama `PendientesDto` porque ese nombre ya lo usa el tablero de respaldos.
- **`total`:** siempre es la suma de los cuatro módulos.
- **Errores:**
  - sin sesión válida, 401;
  - si **algún** conteo falla, 500 con el mensaje «No se pudieron contar los trámites pendientes. Inténtelo de nuevo.»;
  - el error se registra en el servidor con el módulo que falló;
  - **nunca se devuelve 0 en lugar de un conteo fallido**;
  - **no se exponen detalles internos.**

### Qué cuenta como pendiente

Los estados no se llaman igual en los cuatro módulos. No se cambió ninguno; se usa su significado real:

| Clave | Tabla | Cuenta | No cuenta |
|---|---|---|---|
| `accesos` | `control_acceso` | `ABIERTO` y `PENDIENTE` (en gestión, el equivalente de «en progreso») | `CERRADO`. Las solicitudes no se anulan. |
| `mantenimientos` | `mantenimiento` (ejecuciones) | `fase` `PROGRAMADO` y `EN_EJECUCION` | `FINALIZADO`, `CANCELADO` y los anulados. Los **planes** (`plan_mantenimiento`) no son trámites y no cuentan. |
| `vulnerabilidades` | `vulnerabilidad` | `ABIERTO` y `EN_PROGRESO` | `REMEDIADO` y las anuladas |
| `renovaciones` | `renovacion` | `ABIERTO` y `EN_PROGRESO` | `CERRADO` y las anuladas |

**Cómo se cuenta:**

- **Cada registro una vez.** Se cuentan registros de negocio, no historial, trazas ni fases.
- **En la base.** Cada módulo define su conteo en su propio servicio (`contarPendientes()`, un `COUNT`), sin cargar filas.
- **En paralelo.** `DashboardService` lanza los cuatro conteos a la vez y los consolida.
- **Arquitectura.** El módulo `dashboard` solo importa esos servicios (exportados) y ningún módulo depende de él.

**Los anulados no cuentan.** Un registro anulado no es un trámite. Los listados de Mantenimientos, Vulnerabilidades y Renovaciones muestran por defecto los anulados (marcados); con `incluirAnulados=false` sus totales coinciden con el tablero, y una prueba e2e lo comprueba.

### Autorización

- **Guards globales:** se usan los existentes (JWT + roles).
- **Mismo acceso que los listados.** Los listados GET de los cuatro módulos no llevan `@Roles` y no filtran por departamento ni por alcance, así que admin, analista y auditor ven todos los registros. El endpoint aplica la misma regla.
- **Si en el futuro se limita el alcance** de un módulo, hay que aplicar el mismo filtro en su `contarPendientes()`.

### Consumo desde React

- **Hook:** `features/dashboard/api.ts`, con el patrón de los demás (TanStack Query, `openapi-fetch` y `ejecutar`).
- **Cuándo se actualiza:** al volver al inicio, la consulta se repite (staleTime 0), así que los conteos se ponen al día después de cerrar o reabrir un trámite.

```tsx
import { usePendientes } from './api.ts'
import { pendientesDe, textoPendientes } from './pendientes.ts'

const { data } = usePendientes()             // undefined mientras carga o si falla
const n = pendientesDe('/renovaciones', data) // null → no se muestra nada (nunca un 0 falso)
return n !== null && <Badge>{textoPendientes(n)}</Badge>
```

**Integración en el inicio:** `DashboardPage` ya tenía una tarjeta por módulo. Solo se añadió una insignia «N pendientes» en las cuatro tarjetas con trámites, y no cambió nada más de la pantalla. Los indicadores completos siguen previstos para la Fase 4.

## Pruebas

| Dónde | Qué comprueba |
|---|---|
| `api: src/dashboard/dashboard.service.spec.ts` (6) | Consolida los conteos; el total es la suma; un conteo fallido lanza 500 y se registra; la consulta exacta de cada `contarPendientes` es un `count` (nunca `findMany`). |
| `api: test/dashboard.e2e-spec.ts` (7) | Ceros reales; conteos con ABIERTO, en progreso y equivalentes, sin cerrados ni anulados; cada registro una vez (el historial y las trazas no suman); el total; la coincidencia con los listados; un cierre real resta un pendiente; admin, analista y auditor 200; sin sesión o con token alterado, 401; un fallo da 500 genérico; Swagger, sin pisar el esquema de respaldos. |
| `web: shared/cierre/BloqueEjecucionCierre.test.tsx` (8) | Campos y orden; mensajes de validación; etiquetas propias; sin evidencia en Control de acceso; no rellena fechas; tipos de botón; deshabilitación durante una operación en curso; Guardar sin cambios. |
| `web: features/dashboard/pendientes.test.ts` (3) | Conteo por tarjeta; sin datos no muestra 0; singular y plural. |
| Navegador (`scratchpad/nav/p18-cierre-compartido.mjs`, `p18b-corregir-mantenimiento.mjs`) | Los cuatro módulos con sus campos, sus validaciones, las fechas manuales, los cierres y las reaperturas reales; la corrección de mantenimiento; las insignias del inicio igual que la API; el auditor sin acciones. |
