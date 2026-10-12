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

1. Pide el token.
2. Por cada tipo, pide los elementos **por bloques** (`GET /api.php/v2/Assets/Computer?start=0&limit=10`), ordenados por id, hasta el total que GLPI informa en `Content-Range`.
3. Convierte cada elemento a nuestro modelo `Activo`, saneando textos y fechas.
4. Busca en local el activo con el **mismo código de inventario** y decide qué hacer.
5. Si no es una simulación, aplica el cambio y lo registra en el historial con el autor **`GLPI`**.
6. Muestra el informe en consola y lo guarda en JSON (`glpi-informes/`).

## Qué decide para cada elemento

| Resultado | Cuándo | Qué hace al aplicar |
|---|---|---|
| `CREAR` | No hay activo local con ese código | Alta + historial `CREAR` firmado por GLPI |
| `ENLAZAR` | Existe, registrado a mano, con el mismo código | **No duplica.** Actualiza las diferencias y deja constancia del enlace en el historial |
| `ACTUALIZAR` | Ya enlazado y GLPI trae cambios | Actualiza + historial `ACTUALIZAR` firmado por GLPI |
| `SIN_CAMBIOS` | Ya enlazado y todo coincide | Nada |
| `OMITIR` | Papelera o plantilla de GLPI, dado de baja en local, o código repetido en GLPI | Nada; el motivo queda en el informe |

Un activo se considera "ya enlazado" cuando su historial tiene alguna entrada firmada por `GLPI`. No hizo falta cambiar el modelo de datos.

## Correspondencia de campos

| Activo | Origen en GLPI (API v2) | Notas |
|---|---|---|
| `codigo` | `otherserial` (n.º de inventario) | Si está vacío se genera `GLPI-PC-<id>`, `GLPI-RED-<id>` o `GLPI-SW-<id>` |
| `nombre` | `name` | |
| `sistemas` | Equipos: línea "Sistema Operativo …" de `comment` → `model` → `type` · Software: `category` | El listado no trae el SO como campo |
| `custodio` | `user` → `contact` → `user_tech` | |
| `ubicacion` | `location` (nombre completo) | |
| `numeroSerie` | `serial` | Opcional |
| `estado` | `status.name` | Opcional |
| `fabricante` | `manufacturer.name` | Opcional |
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

## Problemas frecuentes

- **`certificate has expired [CERT_HAS_EXPIRED]`:** el certificado HTTPS del servidor GLPI caducó. La solución es que lo renueve quien administra el servidor. Mientras tanto, **solo en desarrollo**, `GLPI_IGNORE_SSL=true` hace que el motor no valide el certificado. Es un riesgo: sin validación, alguien en la red podría suplantar al servidor y leer las credenciales. El motor avisa en cada ejecución y lo rechaza con `NODE_ENV=production`; quita la variable en cuanto se renueve el certificado.
- **La API deja de compilar en Docker tras añadir una dependencia** (`Cannot find module …`): reconstruye la imagen y renueva el volumen de `node_modules` con `docker compose up -d --build --renew-anon-volumes backend`.

## Límites conocidos de esta iteración

- La correspondencia de `Computer` está verificada con una respuesta real de la API v2.2. La de `NetworkEquipment` y `Software` y el parámetro de orden (`sort=id:asc`) salen de la documentación de GLPI: el primer `glpi:simular` los confirmará.
- No se lee el cifrado de discos de los equipos.
- Si alguien cambia el n.º de inventario de un equipo en GLPI, se verá como un activo nuevo.
- La sincronización es completa en cada ejecución; todavía no es incremental.
