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

Cada ejecución sigue cuatro pasos:

1. **Decidir el modo.** *Completa* (todo el inventario) o *incremental* (solo lo modificado en GLPI desde la última ejecución sin errores).
2. **Leer.** Pide el token y, por cada tipo, lee sus elementos por bloques (`GET /api.php/v2/Assets/Computer?start=0&limit=50`), ordenados por id, hasta el total que GLPI informa en `Content-Range`. Convierte cada elemento a nuestro modelo, saneando textos y fechas.
3. **Decidir y aplicar.** En bloques, compara con la base (una consulta por bloque) y, si no es una simulación, escribe cada activo en su propia transacción: el cambio, su entrada de historial firmada por **`GLPI`** y su aviso, o nada.
4. **Reconciliar** (solo tras una lectura completa y correcta): lo que ya no existe en GLPI queda *Dado de baja*.

Al terminar muestra el informe en consola, lo guarda en JSON (`glpi-informes/`) y registra la ejecución en la tabla `sincronizacion`.

**Antes de escribir comprueba la integridad:** si hay registros (respaldos, mantenimientos, vulnerabilidades o historial) que apuntan a un activo que no existe, la sincronización real se niega a escribir. Un alta reutilizaría ese id y heredaría registros ajenos. Esos huérfanos solo aparecen si alguien vacía la tabla de activos saltándose las claves foráneas.

**Nunca borra activos.** Que un elemento falte en una respuesta, o que GLPI falle, no es una orden de borrado ni de baja:

- Si la lectura de un tipo falla (red, error de GLPI, respuesta que no es una lista, o menos elementos de los anunciados), ese tipo **no se procesa** y queda como error. Los demás tipos continúan.
- Un elemento sin `id` válido se rechaza con error, sin crear ningún registro.

## Tipos de activo de GLPI

Cada tipo de GLPI es una **categoría** del inventario (`src/glpi-sync/config.ts`, `TIPOS_GLPI`). El nombre se puede cambiar con `GLPI_CATEGORIA_<TIPO>`; los tipos que se leen se eligen con `GLPI_ITEMTYPES`. La identidad sigue siendo **tipo + id de GLPI** (`origenGlpi`, único): si en GLPI cambia el número de inventario o el nombre, se actualiza el mismo registro.

Comprobado contra el GLPI 11 de la empresa (API v2.2), solo con lecturas:

| Apartado de GLPI | Tipo en la API | Categoría | Estado | Elementos hoy |
|---|---|---|---|---|
| Computadoras | `Computer` | Computadoras | Importado | 26 |
| Monitores | `Monitor` | Monitores | Importado | 20 |
| Programas | `Software` | Programas | Importado (no físico: sin revisión de código institucional) | 341 |
| Dispositivos de redes | `NetworkEquipment` | Dispositivos de redes | Importado | 1 |
| Periféricos | `Peripheral` | Periféricos | Importado | 56 |
| Impresoras | `Printer` | Impresoras | Preparado | 0 |
| Teléfonos | `Phone` | Teléfonos | Importado | 5 |
| Gabinetes | `Enclosure` | Gabinetes | Preparado | 0 |
| Multitomas | `PDU` | Multitomas | Preparado | 0 |
| Dispositivos pasivos | `PassiveDCEquipment` | Dispositivos pasivos | Preparado | 0 |
| Cables | `Cable` | Cables | Importado (su estado viene en `state`, no en `status`) | 1 |
| (Racks) | `Rack` | Racks | Preparado | 0 |
| (Tomas de red) | `Socket` | Tomas de red | Preparado; **sin papelera** en la API (el filtro `is_deleted` devuelve 400) | 0 |
| (Licencias, certificados, aplicativos) | `SoftwareLicense`, `Certificate`, `Appliance` | Licencias, Certificados, Aplicativos | Preparados (no físicos) | 0 |

"Preparado" significa que el tipo se lee en cada sincronización y que la categoría existe, pero hoy GLPI no tiene elementos de ese tipo. En cuanto se registre uno, aparecerá en el inventario.

**Servidores físicos y virtuales.** En GLPI un servidor es un `Computer` cuyo **tipo de equipo** (`type.name`) es «Servidor Físico» o «Servidor Virtual». Hoy son `HP-520` (`Computer #28`) y `VM-CONTABILIDAD` (`Computer #29`).

- **Al crear:** tienen categoría propia, *Servidores físicos* y *Servidores virtuales* (`CATEGORIAS_POR_TIPO_DE_EQUIPO` en `config.ts`; la comparación ignora tildes y mayúsculas). Los demás `Computer` siguen en *Computadoras*. Si la categoría de servidor no existe, el activo se crea en la de su tipo y el informe lo deja «para revisión»; la sincronización no se aborta.
- **Al actualizar:** la categoría no se cambia, porque es un dato local que el admin puede reasignar.
- **Los dos ya importados:** los reclasificó una vez la migración `20261020120000_control_acceso`, con su entrada en la bitácora (responsable SISTEMA, categoría anterior y nueva). Conservan su id y su `origenGlpi`.
- **Comprobado el 2026-10-20:**
  - Sincronización completa en simulación sobre desarrollo: 455 leídos, 0 altas, 0 cambios y 0 errores; no los duplica ni les devuelve la categoría anterior.
  - Sincronización real (`--aplicar`) sobre la base de pruebas vacía: los creó directamente en su categoría.

**Control de acceso.** Cada categoría tiene dos marcas, *Acceso lógico* y *Acceso físico* (`admiteAccesoLogico` / `admiteAccesoFisico`). Las decide el admin en Catálogos y la sincronización no las toca. Ver [control-acceso.md](control-acceso.md).

**No importados, con su motivo:**

| Apartado | Motivo |
|---|---|
| **Cartuchos** y **Consumibles** | No son activos individuales: GLPI registra *modelos* (`CartridgeItem`, `ConsumableItem`) con existencias. En la API v2.2 esos modelos no tienen ruta de listado, y `Cartridge` devuelve error 500 del servidor. Convertir existencias en activos crearía registros ficticios. |
| **Tarjetas SIM** | En GLPI son *componentes* (`/Components/SIMCard`) que se instalan dentro de un teléfono o equipo, no activos independientes. Se podrían mostrar como dato del activo que las contiene; queda pendiente. |
| **Herramientas** y **Elementos** | No existen como tipos en la API v2.2 de este servidor (no aparecen en `/Assets` ni en la documentación `doc.json`). Probablemente son apartados de plugins o menús sin API. |
| **Global** | Es una vista que reúne los demás tipos (`/Assets/Global`: 108 elementos físicos); importarla duplicaría los activos. |
| **Equipos no gestionados** (`Unmanaged`) | La cuenta de servicio recibe 403 (sin permiso). |

**Errores aislados por tipo.** Si falla la lectura de un tipo, ese tipo no se procesa ni se le marca ninguna baja, y el punto de control no avanza; los demás tipos continúan (prueba `incremental.spec.ts`).

## Sincronización incremental

Comprobado contra el GLPI de la institución (API v2.2): el listado admite un filtro RSQL por fecha de modificación.

```
GET /api.php/v2/Assets/Computer?filter=date_mod=ge=2026-10-13T09:45:00&start=0&limit=50&sort=id:asc
```

- **La fecha se envía en la hora local del servidor GLPI, sin desfase.** GLPI interpreta el valor en su zona e **ignora** cualquier desfase que se le añada (con `…T19:04:31Z` no devuelve lo que sí devuelve con `…T14:04:31`). El motor convierte el punto de control a la hora de `GLPI_TIMEZONE` (`America/Guayaquil`).
- **Comprobación de la zona:** en cada lectura compara el desfase de las fechas que envía GLPI (`-05:00`) con el de `GLPI_TIMEZONE`. Si no coinciden, lo informa como error y el punto de control no avanza.
- Un filtro que GLPI no entiende responde **400**; una consulta sin resultados responde **200 con lista vacía**. No se confunden: lo primero es un fallo, lo segundo significa "nada cambió".

### Punto de control y ventana de seguridad

- El **punto de control** es el instante anterior a empezar a leer GLPI en la última ejecución **sin ningún error**. Se guarda en `sincronizacion.puntoControl`.
- La siguiente incremental pide lo modificado desde *punto de control − ventana de seguridad* (`GLPI_VENTANA_SEGURIDAD_MIN`, 15 minutos por defecto). La ventana absorbe diferencias de reloj entre los dos servidores y cambios guardados mientras corría la ejecución anterior. Releer de más es inocuo: lo que no cambió no se escribe.
- **Si algo falla, el punto de control no avanza**: ni con un error de lectura, ni si un solo elemento no pudo escribirse, ni con una lectura parcial (`--max`). La siguiente ejecución vuelve a leer desde el punto anterior, así que no se pierde ningún cambio. Lo que sí se aplicó no se repite (no hay diferencias que escribir).
- Una simulación nunca mueve el punto de control ni escribe nada en la base.

### Cuándo es completa y cuándo incremental

| Situación | Modo |
|---|---|
| Nunca ha habido una ejecución sin errores | Completa |
| Se añadió un tipo a `GLPI_ITEMTYPES` | Completa |
| `--completa`, `--max` o `--mejorar-codigos` | Completa |
| Ejecución automática o de consola, y han pasado `GLPI_RECONCILIACION_HORAS` (24) desde la última completa | Completa |
| Botón **Sincronizar con GLPI** | Incremental, siempre (salvo que un administrador marque *Comprobación completa*) |
| El resto | Incremental |

Así el día a día es rápido y la comprobación integral se hace sola una vez al día, sin cargar a GLPI en cada pulsación.

En una incremental no se ve el resto del inventario de GLPI: para saber si un código candidato ya lo usa otro equipo se consultan los activos ya sincronizados.

### Rendimiento medido

Contra el GLPI de la institución, en simulación, mediana de 5 ejecuciones (13-oct-2026), sin contar el arranque del proceso:

| Tipos | Modo | Tiempo | Peticiones de listado | Datos recibidos | Elementos |
|---|---|---|---|---|---|
| Computer + NetworkEquipment | Completa | 1,08 s | 4 | 19,4 KB | 26 |
| Computer + NetworkEquipment | Incremental | 0,96 s | 4 | 0 KB | 0 |
| + Software | Completa | 2,09 s | 12 | 169,5 KB | 367 |

Con 26 equipos el tiempo lo domina el coste fijo (pedir el token y abrir conexiones, casi 1 s), así que la diferencia es pequeña. La ventaja de la incremental crece con el inventario: no descarga ni compara lo que no cambió y su coste no depende del tamaño. La incremental con Software no se midió (ese tipo no está activado).

Cada tipo cuesta dos consultas: el listado y la papelera (ver abajo).

## Bajas detectadas por la sincronización

Un equipo queda **Dado de baja** en tres casos, y solo en estos:

| Caso | Cómo se detecta | Se guarda en |
|---|---|---|
| Está en la **papelera de GLPI** | GLPI lo informa (`is_deleted`) | `inactivoDesde`, `motivoInactivo = PAPELERA_GLPI` |
| **Ya no existe en GLPI** (eliminado definitivamente) | Una lectura completa y correcta no lo devuelve | `inactivoDesde`, `motivoInactivo = AUSENTE_EN_GLPI` |
| **Baja manual** en la aplicación (solo admin) | Botón *Dar de baja* | `deletedAt` |

Los estados de GLPI (`Malo`, `Regular`, `Bueno`) describen la condición del equipo y **no** intervienen: se muestran tal cual en la columna *Estado*.

- **Papelera.** Se pide expresamente (`filter=is_deleted==1`) además del listado normal, así se detecta tanto si el listado la incluye como si la oculta. Un elemento restaurado vuelve a *Activo* solo. Un elemento que se ve por primera vez estando ya en la papelera se registra como dado de baja, con su código de respaldo.
- **Eliminación definitiva.** GLPI no avisa: el elemento simplemente deja de aparecer. Solo la **reconciliación completa** puede confirmarlo. Una incremental **nunca** marca a nadie por no aparecer.
- **Salvaguarda.** Si en una lectura completa desaparece todo un tipo, o 5 o más equipos que supongan más de la mitad, lo más probable es un problema en GLPI (permisos, entidad) y no una baja real: no se marca a nadie y queda como error. Si es correcto, se confirma desde consola con `--completa --confirmar-bajas`.
- **Nada se borra.** El activo conserva su ficha, su historial, sus respaldos, mantenimientos y vulnerabilidades, y la entrada *Dado de baja por la sincronización* queda en el historial firmada por GLPI.
- Un activo dado de baja a mano no lo toca la sincronización: ni lo actualiza ni lo reactiva.

**Límite:** hoy la papelera del GLPI de la institución está vacía, así que su detección está probada con un GLPI simulado, no contra el servidor real. Sí está comprobado que el servidor acepta el filtro.

La baja se guarda aparte del campo **estado** (que es el valor de GLPI: Bueno, Regular, Malo…): así no se confunde la condición del equipo con su baja administrativa. En el inventario, el filtro *Estado* ofrece los valores reales más *Dado de baja*. Solo los equipos operativos se ofrecen al crear un plan de respaldo, un mantenimiento o una vulnerabilidad, y la API lo valida por su cuenta (400). Los registros anteriores de un equipo dado de baja se siguen consultando y gestionando.

## Historial y avisos

Cada cambio real se escribe en una transacción con tres partes: el cambio en el activo, la entrada de historial (campo, valor anterior, valor nuevo, fecha, autor `GLPI`) y un **aviso** visible en la campana de la aplicación.

| Aviso | Cuándo |
|---|---|
| Alta | Un equipo nuevo en GLPI |
| Modificación | Cambió algún dato gestionado por GLPI |
| Cambio de estado | Cambió el estado (Bueno → Malo…) |
| Baja detectada | Quedó dado de baja (papelera o ya inexistente) |
| Reactivación | Volvió a estar vigente en GLPI |
| Error | Una ejecución no terminó limpia |

- **Sin repeticiones:** el aviso nace de la escritura. Si GLPI no trae diferencias no se escribe nada y no hay aviso, por muchas veces que se relea el elemento.
- Un mismo error que se repite en cada ejecución (GLPI caído) no llena la bandeja: mientras el aviso anterior siga sin leer y diga lo mismo, no se crea otro.
- **Detectado frente a aplicado:** el informe y el registro guardan cuántos cambios traía GLPI (`detectados`) y cuántos se escribieron (`aplicados`). En una simulación, aplicados es siempre 0.
- Los avisos los ven todos los roles; marcarlos como leídos, admin y analista. El estado *leído* es común a todos los usuarios.

## Ejecución manual y automática

**Botón "Sincronizar con GLPI"** (Inventario; admin y analista). Llama a `POST /api/glpi/sincronizacion`: la sincronización corre en el servidor y las credenciales de GLPI nunca llegan al navegador. Muestra un indicador mientras dura, el resumen al terminar y refresca la tabla. Bajo el botón se ve la fecha de la última sincronización sin errores (`GET /api/glpi/sincronizacion`).

**Automática.** El contenedor `glpi-sync` ejecuta el mismo motor según `GLPI_SYNC_CRON` (cada 15 minutos por defecto).

**Una sola a la vez.** Al empezar, cada ejecución real inserta su fila en `sincronizacion` con `enCurso = true`; la columna es única, así que la base rechaza una segunda. El botón responde 409 y el trabajador se salta esa vuelta. El bloqueo se libera al terminar, también si falla. Si el proceso muere sin liberarlo, caduca a los `GLPI_BLOQUEO_CADUCA_MIN` (30) minutos.

## Identidad: quién es quién

La identidad de un activo sincronizado es su **referencia de GLPI**: el tipo de elemento más su id, guardada en `activo.origenGlpi` (por ejemplo `Computer #12` o `NetworkEquipment #1`). La columna tiene un índice **único** en la base de datos.

- Una segunda sincronización del mismo elemento **actualiza** el activo existente.
- Cambiar el n.º de inventario en GLPI, o el código operativo en nuestra aplicación, **no crea un activo nuevo**.
- Dos equipos con el mismo n.º de inventario son **dos activos distintos**.
- `NetworkEquipment #1` y `Computer #1` nunca se confunden.

El n.º de inventario **no** es la identidad: en el GLPI de la institución, 22 de 25 ordenadores comparten el `001`.

### Concurrencia

Dos sincronizaciones no escriben a la vez (ver *Una sola a la vez*). Como última barrera, los índices únicos de `origenGlpi` y `codigo` impiden en la propia base que un mismo elemento se registre dos veces.

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

- El código **no se renombra** después por sí solo: ni por una nueva regla ni porque GLPI cambie. Si lo corriges a mano, la sincronización lo respeta siempre.
- **Mejorar códigos de respaldo (opción explícita):** con `--mejorar-codigos` (o `GLPI_MEJORAR_CODIGOS=true`), un activo que siga con su código de respaldo (`GLPI-PC-12`) pasa al mejor código disponible con las mismas reglas de arriba. Solo afecta a códigos generados; el cambio queda en el historial. Sirve, por ejemplo, si la primera importación se hizo sin configurar la etiqueta institucional.
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
| `categoriaId` | La categoría de su tipo de GLPI (ver «Tipos de activo de GLPI») | **Solo al crear**; los activos ya vinculados se reclasificaron una vez en la migración `20261015120000`, con su entrada en la bitácora |
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

Opciones de `glpi:sync`: `--simular` o `--aplicar`, `--completa` o `--incremental`, `--confirmar-bajas`, `--max=N` (tope por tipo), `--bloque=N` y `--mejorar-codigos`.

**La simulación es el modo por defecto.** Solo se escribe con `--aplicar`, con `GLPI_DRY_RUN=false` o desde el botón de la aplicación.

La conexión con GLPI se configura **solo** en `gestion-activos-api/.env`: lo leen la consola, la API y el contenedor `glpi-sync`. En el `.env` de la raíz (el de Docker Compose) solo va cómo trabaja el trabajador: `GLPI_DRY_RUN`, `GLPI_SYNC_CRON`, `GLPI_RECONCILIACION_HORAS` y `GLPI_VENTANA_SEGURIDAD_MIN`.

## Activar la escritura automática

El trabajador simula por defecto. Para que escriba:

1. **Respaldo verificado** (PowerShell, desde la raíz del repositorio):

   ```powershell
   docker exec servidor-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --set-gtid-purged=OFF --databases gestion_activos_db' > C:\Users\adminqt\gestion-activos-respaldos\respaldo.sql
   ```

   `--set-gtid-purged=OFF` es necesario: sin él, el respaldo no se puede restaurar en el mismo servidor. Un respaldo solo cuenta si se ha probado a restaurarlo (paso de abajo, sobre una base temporal).
2. **Simulación** y revisión del informe: `npm run glpi:sync -- --simular`. No debe haber errores y los cambios deben ser los esperados.
3. En el `.env` de la raíz: `GLPI_DRY_RUN=false`.
4. `docker compose --profile glpi up -d --force-recreate glpi-sync` y comprobar el arranque con `docker compose logs glpi-sync` (debe decir *APLICA cambios*).

Para volver a simulación: `GLPI_DRY_RUN=true` y recrear el contenedor.

### Restaurar un respaldo

La restauración **reemplaza** la base actual: se pierde todo lo posterior al respaldo. Detén antes lo que escribe.

```powershell
docker compose stop backend glpi-sync
Get-Content C:\Users\adminqt\gestion-activos-respaldos\respaldo.sql | docker exec -i servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
docker compose --profile glpi start backend glpi-sync
```

Para **comprobar un respaldo sin tocar la base real**, restáuralo en una base temporal y compara recuentos:

```bash
sed -E 's/`gestion_activos_db`/`verif_respaldo_tmp`/' respaldo.sql | docker exec -i servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
docker exec servidor-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT COUNT(*) FROM verif_respaldo_tmp.activo; DROP DATABASE verif_respaldo_tmp;"'
```

Deshacer **solo** lo que hizo la sincronización, sin restaurar: cada cambio está en el historial del activo con su valor anterior, y los equipos marcados como dado de baja vuelven solos a Activo si reaparecen en GLPI.

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
- **Papelera de GLPI:** su detección no se ha podido probar contra el servidor real (hoy está vacía).
- **Reloj del servidor GLPI:** la consulta incremental depende de que su hora sea razonablemente correcta. La ventana de seguridad cubre desfases de hasta 15 minutos (configurable) y la reconciliación diaria recoge lo que se hubiera escapado.
- **Avisos leídos:** el estado es común a todos los usuarios, no individual.
- **Pruebas del botón:** el endpoint y su lógica están probados de punta a punta; el componente visual no tiene pruebas de renderizado.
