# Conexión con MySQL

## El problema que resuelve

Tras reiniciar el equipo o el contenedor `servidor-mysql`, la API respondía **500** en todas las pantallas («Unable to start a transaction in the given time»), aunque MySQL estaba en marcha. El error real del driver era:

```
ER_CANNOT_RETRIEVE_RSA_KEY (45044): RSA public key is not available client side
```

**Causa.** La aplicación se autentica con `caching_sha2_password`, el método por defecto de MySQL 8 y posteriores. MySQL guarda en memoria una caché de credenciales que **se vacía al reiniciar**. Con la caché vacía hace falta la autenticación completa, y en una conexión sin TLS el cliente debe cifrar la contraseña con la **clave pública RSA** del servidor. El driver no la tenía, así que fallaba; cada intento sumaba un `Aborted_connects`. Un inicio de sesión manual con TLS volvía a llenar la caché, y por eso «arreglaba» el problema hasta el siguiente reinicio.

No era un problema de disponibilidad (MySQL respondía a `mysqladmin ping`), ni de contraseña, ni de permisos.

## La solución

La API **fija la clave pública del servidor** (`src/prisma/conexion.ts`). Con ella cifra la contraseña sin depender de la caché ni de pedir la clave por la red.

| Alternativa probada tras un reinicio en frío | Resultado | Por qué se descartó o se eligió |
|---|---|---|
| TLS validando la CA de MySQL | Falla: el certificado autogenerado no incluye `localhost` ni `host.docker.internal` | Exigiría generar y configurar otro certificado en MySQL, o desactivar la comprobación del nombre (no se desactiva ninguna validación) |
| `allowPublicKeyRetrieval=true` | Funciona | El cliente aceptaría la clave que le envíe quien responda: vulnerable a suplantación |
| **Clave pública fijada** (`cachingRsaPublicKey`) | **Funciona** | La clave se toma del propio servidor por un canal de confianza (`docker cp`) |

No cambian ni la contraseña, ni el usuario, ni el método de autenticación, ni la configuración de MySQL. La URL de conexión tampoco: el CLI de Prisma (migraciones), que usa su propio motor, funciona igual.

## Puesta en marcha

```bash
cd gestion-activos-api
npm run db:clave-mysql      # copia la clave de servidor-mysql a certs/mysql-public-key.pem
```

- La API la usa sola si existe `certs/mysql-public-key.pem`. Otra ruta se indica con `DATABASE_RSA_PUBLIC_KEY`. Sin clave, la API se conecta como antes.
- Es una clave **pública**: no es un secreto. Aun así es propia de cada instalación, así que `certs/` no se versiona ni entra en la imagen Docker.
- **Repetir el comando** solo si se recrea el contenedor o el volumen de datos de MySQL, porque entonces la clave cambia. Si la ruta indicada no existe, la API se niega a arrancar y lo dice.
- El contenedor de la API y el worker de GLPI montan `gestion-activos-api` en `/app`, así que leen el mismo archivo.

## Arranque tras un reinicio

- `servidor-mysql` y `servidor-keycloak` tienen la política de reinicio `unless-stopped` (aplicada con `docker update`). `backend` y `frontend` también, en `docker-compose.yml`. Vuelven a arrancar cuando lo hace Docker Desktop, siempre que esté configurado para iniciarse con la sesión de Windows.
- Si la API arranca antes que MySQL, **espera**: reintenta unos 30 s (15 intentos cada 2 s) con una consulta real antes de aceptar peticiones. Un error de credenciales falla en el acto y muestra su causa, porque reintentar no lo arregla.
- Si MySQL se reinicia con la API en marcha, el pool reconecta solo en la siguiente petición.

## Comprobaciones realizadas (2026-10-15)

- Reproducción: tras `docker restart servidor-mysql`, la API respondía 500 y `ER_CANNOT_RETRIEVE_RSA_KEY` aparecía en cada intento.
- Dos ciclos completos: parada de todo y arranque de la API **antes** que MySQL, sin ninguna acción manual. Todas las consultas devolvieron 200, `Aborted_connects` se quedó en 0, había 0 errores de conexión en los registros y los conteos de datos no cambiaron.
- Reinicio solo de MySQL con la API en marcha: la API siguió respondiendo 200.
- `prisma migrate status` con la caché vacía: correcto.
