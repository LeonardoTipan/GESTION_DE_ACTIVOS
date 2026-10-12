# Sincronización con GLPI

Motor en segundo plano que trae el inventario de GLPI (equipos, equipos de red y software) a nuestra base de datos. Es un **proceso aparte de la API**: vive en `gestion-activos-api/src/glpi-sync/`, no lo importa `AppModule` y corre en su propio contenedor (`glpi-sync`).

La sincronización va en un solo sentido: **GLPI → nuestra aplicación**. Nunca escribe en GLPI.

## Autenticación (OAuth2)

Se usa la **API v2 de GLPI** (`/api.php`), que se autentica con OAuth2, grant `password`:

1. Al empezar cada sincronización, el worker hace `POST /api.php/token` con el cliente OAuth y el usuario de servicio.
2. El `access_token` se guarda **solo en memoria** y viaja como `Authorization: Bearer …`.
3. Si le queda menos de un minuto de vida, o GLPI responde 401, se pide otro y se reintenta una vez.
4. Al terminar el ciclo, el token se descarta.

No se guarda ningún token en `.env`: caducan en una hora y un worker programado dejaría de funcionar. En `.env` van las credenciales (`GLPI_CLIENT_ID`, `GLPI_CLIENT_SECRET`, `GLPI_USERNAME`, `GLPI_PASSWORD`), que no caducan.

Recomendaciones:

- Usa una **cuenta de servicio de solo lectura** en GLPI, no un usuario personal.
- Fuera de la red local, `GLPI_API_URL` debe ser `https://`; el motor rechaza `http://` con servidores remotos.

## Cómo funciona

Trabaja en dos fases:

1. **Leer.** Pide el token y, por cada tipo, lee **todos** sus elementos por bloques (`GET /api.php/v2/Assets/Computer?start=0&limit=50`), ordenados por id, hasta el total que GLPI informa en `Content-Range`. Convierte cada elemento a nuestro modelo, saneando textos y fechas. Con todo leído sabe qué códigos se repiten.
2. **Decidir y aplicar.** En bloques, compara con la base y, si no es una simulación, escribe cada activo en su propia transacción, con el historial firmado por **`GLPI`**.

Al terminar muestra el informe en consola y lo guarda en JSON (`glpi-informes/`).

**Nunca borra ni da de baja activos.** Que un elemento falte en una respuesta, o que GLPI falle, no es una orden de borrado:

- Si la lectura de un tipo falla (red, error de GLPI, respuesta que no es una lista), ese tipo **no se procesa** y queda como error. Los demás tipos continúan.
- Una respuesta válida con cero elementos no es un error: simplemente no hay nada que sincronizar.
- Un elemento sin `id` válido se rechaza con error, sin crear ningún registro.

## Identidad: quién es quién

La identidad de un activo sincronizado es su **referencia de GLPI**: el tipo de elemento más su id, guardada en `activo.origenGlpi` (por ejemplo `Computer #12` o `NetworkEquipment #1`). La columna tiene un índice **único** en la base de datos.

- Una segunda sincronización del mismo elemento **actualiza** el activo existente.
- Cambiar el n.º de inventario en GLPI, o el código operativo en nuestra aplicación, **no crea un activo nuevo**.
- Dos equipos con el mismo n.º de inventario son **dos activos distintos**.
- `NetworkEquipment #1` y `Computer #1` nunca se confunden.

El n.º de inventario **no** es la identidad: en el GLPI de la institución, 22 de 25 ordenadores comparten el `001`.

### Concurrencia

Dos sincronizaciones simultáneas no pueden crear el mismo activo: los índices únicos de `origenGlpi` y `codigo` lo impiden en la propia base. La que llega tarde recibe un error explicado en el informe, su transacción se deshace entera (activo e historial) y la siguiente ejecución lo encuentra todo en orden.

## Qué decide para cada elemento

| Resultado | Cuándo | Qué hace al aplicar |
|---|---|---|
| `ACTUALIZAR` | Ya vinculado por su referencia y GLPI trae cambios | Actualiza los campos de GLPI + historial firmado por GLPI |
| `SIN_CAMBIOS` | Ya vinculado y todo coincide | Nada |
| `ENLAZAR` | Activo registrado a mano con coincidencia **inequívoca** | Lo vincula (sin duplicar) y deja constancia en el historial |
| `CREAR` | No hay activo vinculado ni coincidencia segura | Alta + historial `CREAR` firmado por GLPI |
| `OMITIR` | Papelera o plantilla de GLPI, o dado de baja en local | Nada; el motivo queda en el informe |

### Código operativo

El **código** (`activo.codigo`) es el identificador visible y único en nuestra aplicación. Se decide **solo al crear**, por este orden:

1. **Código institucional** anotado en el comentario de GLPI (`QUITO TURISMO: 7-1-22-177`), si cumple el formato y es único.
2. **N.º de inventario** de GLPI (`otherserial`), si no está vacío y es único.
3. **Código de respaldo**, determinista: `GLPI-PC-<id>`, `GLPI-RED-<id>` o `GLPI-SW-<id>`.

"Único" significa: no repetido entre los elementos de GLPI leídos, no usado por otro activo local y no asignado ya en la misma ejecución.

Reglas:

- El código **nunca se renombra** después: ni por una nueva regla ni porque GLPI cambie. Si lo corriges a mano, la sincronización lo respeta.
- Si dos elementos comparten el código institucional, **se conservan los dos** y ninguno lo recibe como código: ambos usan el siguiente candidato y quedan marcados para revisión.
- El valor **original** se guarda siempre aparte, sin corregir: `codigoInstitucional` y `numeroInventario`. Un código mal formado (`7-1722-47`, `7-1-7-22--76`) se conserva tal cual, pero no se usa como código operativo.
- Un valor con prefijo, como `S/N: 7-1-22-183`, se guarda **entero** y tampoco se usa como código: no se da por hecho qué parte es el código. Solo un `S/N` a secas se entiende como "sin número" y no se guarda.

El texto que precede al código y su formato se configuran con `GLPI_CODIGO_INSTITUCIONAL_ETIQUETA` y `GLPI_CODIGO_INSTITUCIONAL_FORMATO`.

### Vinculación de activos registrados a mano

Un activo manual se vincula con un elemento de GLPI solo si la coincidencia es **inequívoca**:

- el valor (código institucional o n.º de inventario) no está vacío;
- no está repetido entre los elementos de GLPI;
- coincide con **un único** activo manual vigente (por su código operativo o por el campo equivalente);
- ese activo no tiene ya otra referencia de GLPI.

Si hay cualquier duda, **no se combinan registros**: el elemento de GLPI se crea aparte y el caso aparece en la sección "Requieren revisión manual" del informe. Nunca se elimina un activo manual.

### Fuente de verdad de cada campo

| Campos | Quién manda | Comportamiento |
|---|---|---|
| `codigo`, categoría, criticidad, `cifrado`, `ultimaRevision`, `direccionIp`, `fechaCompra` | **Nuestra aplicación** | La sincronización nunca los modifica (solo les da un valor inicial al crear) |
| Nombre, sistemas, responsable, ubicación, n.º de serie, estado, fabricante, tipo, modelo, técnico, red, contacto, fecha de alta, comentario, n.º de inventario, código institucional | **GLPI**, en activos vinculados | El valor de GLPI sustituye al local. Si GLPI lo tiene **vacío**, el valor local se conserva |

Al **vincular** un activo manual se aplica la misma regla: los valores de GLPI sustituyen a los locales en esos campos. No ocurre en silencio: la simulación lo muestra antes (`≠ campo: local "…" → GLPI "…"`) y el historial guarda el valor anterior de cada campo.

## Correspondencia de campos

| Activo | Origen en GLPI (API v2) | Notas |
|---|---|---|
| `origenGlpi` | Tipo e id del elemento (`Computer #12`) | Identidad; único |
| `codigo` | Ver "Código operativo" | **Solo al crear** |
| `numeroInventario` | `otherserial` | El valor original de GLPI; puede repetirse |
| `codigoInstitucional` | Línea `QUITO TURISMO: …` de `comment` | El valor original, sin corregir; puede repetirse |
| `direccionIp`, `fechaCompra` | — | Datos locales: GLPI no los informa y nunca se inventan |
| `nombre` | `name` | |
| `sistemas` | Equipos: línea "Sistema Operativo …" de `comment` → `model` → `type` · Software: `category` | El listado no trae el SO como campo |
| `custodio` | `user` → `contact` → `user_tech` | |
| `ubicacion` | `location` (nombre completo) | |
| `numeroSerie` | `serial` | Opcional |
| `estado` | `status.name` | Opcional |
| `fabricante` | `manufacturer.name` | Opcional |
| `tipo` | `type.name` | Opcional |
| `modelo` | `model.name` | Opcional |
| `tecnicoResponsable` | `user_tech.name` | Opcional |
| `red` | `network.name` | Opcional |
| `contacto` | `contact` | Opcional |
| `fechaAlta` | `date_creation` | Cuándo se registró en GLPI; se guarda en UTC |
| `comentario` | `comment` | Columna `TEXT`: se guarda completo con sus saltos de línea (tope de 5000 caracteres) |
| `cifrado` | — | GLPI no lo informa en el listado: `false` al crear y después lo gestiona nuestra app |
| `ultimaRevision` | `date_mod` → `date_creation` (con su desfase, p. ej. `-05:00`, se guardan en UTC) | **Solo al crear** |
| `categoriaId` | Por tipo: Hardware, Red, Software | **Solo al crear** |
| `criticidadId` | `GLPI_CRITICIDAD_DEFECTO` (por defecto `Media`) | **Solo al crear**; GLPI no la conoce |

Reglas de saneamiento:

- **Campos vacíos en GLPI nunca pisan datos locales.** Los valores de relleno ("No especificado", "Sin asignar", "Sin ubicación") solo se usan en altas.
- **Zona horaria:** las fechas que traen desfase (`2026-05-14T10:02:24-05:00`) se convierten a UTC directamente. Las que lleguen sin desfase se interpretan en `GLPI_TIMEZONE`, que es obligatoria.
- **Textos largos:** lo que supere 191 caracteres se recorta (terminado en "…") y queda anotado en el informe.

## Uso

Configura las variables `GLPI_*` en `gestion-activos-api/.env` (ver `.env.example`). Desde `gestion-activos-api/`:

```bash
npm run glpi:simular            # simulación con 10 elementos de cada tipo
npm run glpi:sync -- --simular  # simulación completa
npm run glpi:sync -- --aplicar  # escribe en la base
npm run glpi:worker             # worker con node-cron (GLPI_SYNC_CRON)
```

Opciones de `glpi:sync`: `--simular` o `--aplicar`, `--max=N` (tope por tipo) y `--bloque=N`.

**La simulación es el modo por defecto.** Solo se escribe con `--aplicar` o con `GLPI_DRY_RUN=false`.

## GLPI local de pruebas (Docker)

El perfil `glpi` de `docker-compose.yml` levanta un GLPI con **su propia base de datos** (`glpi-db`), separada de la principal, y el worker:

```bash
docker compose --profile glpi up -d          # glpi-db + glpi + glpi-sync
docker compose logs -f glpi                  # la instalación inicial tarda unos minutos
docker compose logs -f glpi-sync
```

- GLPI queda en `http://localhost:8081` (usuario inicial `glpi` / `glpi`).
- Para usar la API hay que crear un cliente en **Configuración → Clientes OAuth** con el grant *Password* y el scope `api`, y copiar su id y su secreto a `.env`.
- Desde el contenedor `glpi-sync`, el GLPI local es `http://glpi/api.php`. Desde Windows (`npm run glpi:simular`) es `http://localhost:8081/api.php`.

Sin `--profile glpi`, `docker compose up` sigue arrancando solo `backend` y `frontend`.

## Diagnóstico

`docs/glpi-diagnostico.sql` contiene consultas de solo lectura para comprobar referencias y códigos duplicados, activos manuales sin vincular, códigos institucionales por revisar y registros huérfanos.

## Problemas frecuentes

- **`certificate has expired [CERT_HAS_EXPIRED]`:** el certificado HTTPS del servidor GLPI caducó. La solución es que lo renueve quien administra el servidor. Mientras tanto, **solo en desarrollo**, `GLPI_IGNORE_SSL=true` hace que el motor no valide el certificado. Es un riesgo: sin validación, alguien en la red podría suplantar al servidor y leer las credenciales. El motor avisa en cada ejecución y lo rechaza con `NODE_ENV=production`; quita la variable en cuanto se renueve el certificado.
- **La API deja de compilar en Docker tras añadir una dependencia** (`Cannot find module …`): reconstruye la imagen y renueva el volumen de `node_modules` con `docker compose up -d --build --renew-anon-volumes backend`.

## Límites conocidos de esta iteración

- No se lee el cifrado de discos de los equipos.
- **Fecha de compra y dirección IP:** no se sincronizan. En el GLPI de la empresa ningún equipo tiene datos financieros (`Infocom`) ni tarjetas de red registradas, y la API v2 no expone las IP. Existen como campos locales, editables a mano y vacíos por defecto.
- Con `--max` la lectura es parcial: la unicidad de los códigos solo se comprueba entre lo leído, y el informe lo advierte.
- Lo que desaparece de GLPI no se da de baja en local: hay que hacerlo a mano.
- La sincronización es completa en cada ejecución; todavía no es incremental.
