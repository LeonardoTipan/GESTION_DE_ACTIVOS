# Pendientes técnicos para el despliegue a producción

Estos puntos **no bloquean** el desarrollo del frontend. Se revisarán en la fase
final de despliegue. Registrados el 2026-10-01, al completar los cinco módulos
del backend (`auth`, `inventory`, `backups`, `maintenance`, `vulnerabilities`).

| # | Tema | Situación actual | Qué hacer antes de producción |
|---|------|------------------|-------------------------------|
| 1 | **URLs de retorno en Keycloak** | El cliente `gestion-activos-web` acepta `http://localhost/*`. Por la regla de loopback (RFC 8252), Keycloak lo trata como *cualquier puerto y cualquier ruta* en `localhost`. | Registrar solo las URLs exactas del dominio de producción (HTTPS) en `keycloak/realm-gestion-activos.json` y sincronizar con `keycloak/configurar-keycloak.ps1`. Quitar también *Direct Access Grants*, que hoy solo sirve para los tests. |
| 2 | **Longitud de textos** | En `respaldo` (`alcanceDetalle`, `rutaEvidencia`, `resultadoPrueba`) y `mantenimiento` (`actividad`, `resultado`) los textos son `VARCHAR(191)`; la API lo valida con un 400 claro. | Si el equipo necesita textos más largos, una migración a `TEXT`, como ya se hizo en `vulnerabilidad.descripcion` y `vulnerabilidad.mitigacion`. |
| 3 | **Imagen Docker de producción** | `gestion-activos-api/Dockerfile` es solo para desarrollo: incluye devDependencies y corre `nest start --watch`. | Crear un Dockerfile multi-etapa (build → runtime con `node dist/main.js`, solo dependencias de producción, usuario no root) y un compose de producción sin volúmenes de código. Swagger se desactiva solo con `NODE_ENV=production`. |
| 4 | **Seguridad de dependencias** | `npm audit` reporta avisos en los drivers `mariadb`/`mysql2` (usados por `@prisma/adapter-mariadb`) sin corrección disponible: filtración de credenciales ante un MitM y escapado con charsets asiáticos. | Revisar si salió una versión corregida; activar **TLS** en la conexión a MySQL; usar un usuario de MySQL con permisos mínimos en lugar de `root`. **No** ejecutar `npm audit fix --force` (bajaría Prisma a la v6). |
| 5 | **Amends accidentales en git** | Un *commit amend* desde VS Code mezcló dos módulos en una rama ya subida (corregido el 2026-10-01). | Evitar *Commit (Amend)* en ramas ya publicadas; valorar proteger `main` en GitHub para que solo acepte cambios vía Pull Request. |

## Fuera de alcance hasta nueva orden

- **Integración con GLPI**: bloqueada por decisión del proyecto hasta que el backend
  y el frontend propios funcionen al 100 % y se dé la orden explícita.
