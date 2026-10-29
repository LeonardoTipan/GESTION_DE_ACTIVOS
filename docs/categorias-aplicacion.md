# Elegibilidad de las categorías por módulo

Cada categoría indica en qué módulos se ofrecen sus activos. Lo configura el administrador en **Catálogos > Categorías**.

| Bandera | Módulo | Efecto hoy |
|---|---|---|
| `aplicaMantenimiento` | Mantenimientos | Filtra el selector y lo valida el backend |
| `aplicaVulnerabilidad` | Vulnerabilidades | Filtra el selector y lo valida el backend (hardware o software según la configuración, no por la clase) |
| `aplicaRenovacion` | Renovaciones | Filtra el selector y lo valida el backend |
| `aplicaEvaluacion` | Evaluación de Sistemas Productivos | Solo se guarda: el módulo aún no existe ([requisitos](requisitos-evaluacion-sistemas.md)) |
| `aplicaEndpoint` | Protección de Endpoints | Solo se guarda: el módulo aún no existe ([requisitos](requisitos-proteccion-endpoints.md)) |

## Reglas

- **No sustituye el estado operativo.** Un activo se ofrece y se acepta si está **operativo** (no dado de baja ni en un estado de `ESTADOS_NO_OPERATIVOS`) **y** su categoría está habilitada para el módulo. La condición física (Bueno, Regular, Malo) no influye.
- **El backend lo valida al crear un registro**, aunque la petición no venga de la interfaz:
  - planificar un mantenimiento, crear una ejecución desde un plan o volver a poner en vigor un plan;
  - registrar una vulnerabilidad, también en lote;
  - planificar una renovación o cambiar su sistema.

  Si la categoría no está habilitada responde **400** con un mensaje que indica la categoría y dónde se configura.
- **Nunca cambia el activo ni la categoría para permitir una operación.**
- **Registros existentes.** Si una categoría deja de aplicar, sus registros se conservan, se siguen consultando y se pueden terminar (iniciar, cerrar, reabrir, corregir). Solo se impiden registros **nuevos** para ese activo.
- **Una categoría nueva no es elegible en ningún módulo** hasta que el admin la habilite. Es el mismo criterio que el acceso lógico y físico.
- **Respaldos y Control de acceso no cambian.**

## API

- `GET /api/categorias`, `POST /api/categorias` y `PATCH /api/categorias/{id}` (crear y modificar, solo admin) leen y escriben las cinco banderas.
- `GET /api/activos?operativos=true&aplica=MANTENIMIENTO|VULNERABILIDAD|RENOVACION` devuelve los activos del selector de cada módulo.
- `GET /api/activos/categorias?operativos=true&aplica=…` devuelve las categorías de ese selector.
- Cualquier otro valor de `aplica` responde 400.

## Matriz revisada (pendiente de aprobación)

### De dónde sale cada categoría

La sincronización asigna la categoría según el **tipo de GLPI** (`TIPOS_GLPI` en `src/glpi-sync/config.ts`). Los servidores son `Computer` con tipo de equipo «Servidor físico» o «Servidor virtual».

Las cinco categorías genéricas de la semilla (Hardware, Software, Información, Red, Servicio) **no las asigna GLPI**.

Los datos se obtuvieron con consultas de **solo lectura** a `gestion_activos_db` el 29/10/2026:

- **Ningún activo tiene fecha de compra.** Los equipos físicos tienen número de serie: Computadoras 21 de 26, Monitores 19 de 20, Periféricos 34 de 56, Teléfonos 5 de 5.
- **Ningún activo tiene dirección IP** registrada.
- **Todos los activos tienen criticidad no crítica.**

**«Programas» y «Aplicativos» no son equivalentes:**

- **«Programas»** es el `Software` de GLPI, es decir, el **inventario de software instalado** en los equipos. Sus 349 elementos son, aproximadamente:
  - 146 componentes de Windows y controladores empaquetados;
  - 53 utilidades de fabricantes (ASUS, NVIDIA…);
  - 19 parches KB;
  - 14 runtimes;
  - 14 de ofimática y comunicación (Microsoft 365, Chrome, AnyDesk);
  - 12 de desarrollo (Git, XAMPP, MySQL, Bizagi Modeler);
  - 4 de seguridad (ESET Endpoint Security, ESET Management Agent…);
  - 87 de otros tipos (WinRAR, PuTTY, Safetica, GLPI Agent…).

  **No contiene sistemas de negocio.**
- **«Aplicativos»** es el `Appliance` de GLPI: sistemas o aplicaciones de negocio. **Hoy está vacía.** El único sistema de negocio visible es la máquina virtual «VM-CONTABILIDAD», en *Servidores virtuales*.

### Tabla por categoría

Leyenda: ✔ habilitada · ✘ no habilitada · ⏳ **pendiente de aprobación**. El SQL de la migración (versión v1, ver más abajo) deja en `false` todos los ⏳ **salvo tres, que deja en `true`**: Programas en Renovaciones, y Servidores físicos y Servidores virtuales en Endpoints.

Las abreviaturas de las columnas son Mant. (mantenimiento), Vuln. (vulnerabilidades), Renov. (renovaciones), Eval. (evaluación) y Endp. (endpoints).

| Categoría (nombre exacto) | Activos | Tipo de elemento y uso real | Mant. | Vuln. | Renov. | Eval. | Endp. | Justificación | Riesgo de las exclusiones |
|---|---|---|---|---|---|---|---|---|---|
| Computadoras | 26 | Portátiles y equipos de escritorio de usuario (Lenovo, ASUS, DELL, HP, Acer); 1 plan y 3 mantenimientos | ✔ | ✔ | ✔ | ✘ | ✔ | Se mantienen y tienen software vulnerable y garantía. Son los **endpoints** sujetos a antivirus/EDR (ESET aparece instalado) | Eval.: no son sistemas de producción |
| Servidores físicos | 1 | «HP-520» (`Computer`, tipo «Servidor físico») | ✔ | ✔ | ✔ | ✘ | ⏳ | Hardware crítico: mantenimiento, firmware y garantía | Endp.: puede tener otra política (EDR de servidor o exclusión). Falta saber si entra en la métrica mensual de antivirus |
| Servidores virtuales | 1 | «VM-CONTABILIDAD»; 2 vulnerabilidades y 1 renovación | ✔ | ✔ | ✔ | ⏳ | ⏳ | Sistema en producción. Vuln. y Renov. son obligatorias por la salvaguarda (ya tiene registros) | Eval.: hoy es lo único que representa un sistema en producción; si se excluye y no se registran *Appliances*, Evaluación no tendrá activos. Endp.: como los servidores físicos |
| Dispositivos de redes | 1 | Central telefónica GrandStream UCM6304; 1 plan y 5 mantenimientos | ✔ | ✔ | ✔ | ✘ | ✘ | Equipo de red con firmware y contrato de soporte | Endp.: no lleva antivirus |
| Teléfonos | 5 | Teléfonos IP GrandStream GRP2614 | ✔ | ✔ | ✘ | ✘ | ✘ | Firmware actualizable y vulnerable | Renov.: no hay contratos ni garantías individuales registrados |
| Impresoras | 0 | `Printer` (sin activos) | ✔ | ✔ | ✔ | ✘ | ✘ | Equipos en red con firmware y contratos de servicio | Ninguno hoy |
| Monitores | 20 | Monitores Samsung, LG, HP, Apple (19 con serie) | ✔ | ✘ | ⏳ | ✘ | ✘ | Solo intervención física | Vuln.: no ejecutan software. Renov.: no hay fecha de compra; falta saber si se gestionan sus garantías |
| Periféricos | 56 | Ratones, teclados, audífonos, parlantes; **también un switch D-Link DES-1008A y un proyector EPSON** | ⏳ | ✘ | ⏳ | ✘ | ✘ | La mayoría no se interviene | El switch y el proyector están mal clasificados en GLPI: lo correcto es reclasificarlos allí (`NetworkEquipment` / `Peripheral`) en vez de habilitar los 56. Mant. y Renov. dependen de esa decisión |
| Racks | 0 | `Rack` | ✔ | ✘ | ✘ | ✘ | ✘ | Mantenimiento físico | Ninguno hoy |
| Gabinetes | 0 | `Enclosure` | ✔ | ✘ | ✘ | ✘ | ✘ | Mantenimiento físico | Ninguno hoy |
| Aplicativos | 0 | `Appliance`: sistemas de negocio (vacía) | ✔ | ✔ | ✔ | ✔ | ✘ | Es la categoría de los sistemas que pasan a producción | Si sigue vacía, Evaluación no tiene activos elegibles (ver Servidores virtuales) |
| Programas | 349 | Inventario de software instalado (ver composición) | ⏳ | ✔ | ⏳ | ✘ | ✘ | Vuln.: una versión instalada vulnerable es una vulnerabilidad real | Mant.: un componente de Windows o un controlador no se «mantiene» como sistema; si se excluye, el mantenimiento de software solo tendrá *Servidores virtuales* y, cuando existan, *Aplicativos*. Renov.: contiene suscripciones (Microsoft 365, ESET, Safetica) que podrían renovarse aquí mientras *Licencias* esté vacía. Eval.: no son sistemas de producción |
| Licencias | 0 | `SoftwareLicense` | ✘ | ✘ | ✔ | ✘ | ✘ | Caducan y se renuevan | Ninguno |
| Certificados | 0 | `Certificate` | ✘ | ✔ | ✔ | ✘ | ✘ | Caducan; un certificado débil o caducado es una vulnerabilidad | Ninguno |
| Cables | 1 | Adaptador USB | ✘ | ✘ | ✘ | ✘ | ✘ | Elemento pasivo | Ninguno |
| Multitomas | 0 | `PDU` | ✘ | ✘ | ✘ | ✘ | ✘ | Pasivo (una PDU gestionable con firmware se habilitaría a mano) | Bajo |
| Tomas de red | 0 | `Socket` | ✘ | ✘ | ✘ | ✘ | ✘ | Elemento pasivo | Ninguno |
| Dispositivos pasivos | 0 | `PassiveDCEquipment` | ✘ | ✘ | ✘ | ✘ | ✘ | Elemento pasivo | Ninguno |
| Hardware | 0 | Genérica de la semilla; GLPI no la usa | ✘ | ✘ | ✘ | ✘ | ✘ | Sin activos ni origen | Ninguno |
| Software | 0 | Genérica de la semilla | ✘ | ✘ | ✘ | ✘ | ✘ | Sin activos ni origen | Ninguno |
| Información | 0 | Genérica de la semilla | ✘ | ✘ | ✘ | ✘ | ✘ | Sin activos ni origen | Ninguno |
| Red | 0 | Genérica de la semilla | ✘ | ✘ | ✘ | ✘ | ✘ | Sin activos ni origen | Ninguno |
| Servicio | 0 | Genérica de la semilla | ✘ | ✘ | ✘ | ✘ | ✘ | Sin activos ni origen | Ninguno |

### Efecto en desarrollo frente a hoy (todo operativo era elegible)

| Módulo | Elegibles hoy | Con la matriz (sin los ⏳) |
|---|---|---|
| Mantenimientos | 460 | 54 (Computadoras, servidores, central, teléfonos, monitores) |
| Vulnerabilidades | 460 | 383 (incluye los 349 Programas) |
| Renovaciones | 460 | 29 (Computadoras, servidores, central) |

### Valores pendientes de decisión

Tres valores de la matriz v1 (la del SQL) **difieren de la matriz revisada**: la v1 los habilita y la revisión los dejó pendientes (⏳). **No se han cambiado** y la migración no se reescribe. Tras aplicarla, cada uno se fija desde Catálogos > Categorías (esa edición no deja traza en `registro_cambio`) o con una migración **nueva** de solo `UPDATE`.

**Decidido y aplicado el 29/10/2026** (decisión del usuario: el antivirus/EDR se mide en las estaciones de trabajo): los tres valores pasaron a **No** en desarrollo, por la API de Catálogos. Además, **provisionalmente**, *Servidores virtuales* → Evaluación = **Sí** (VM-CONTABILIDAD), para las pruebas, hasta que los sistemas se registren como *Appliance* en GLPI. Ver [aplicar-migraciones-desarrollo.md](aplicar-migraciones-desarrollo.md#5-resultado-de-la-ejecución-29102026).

| Valor | Configuración actual (v1, al aplicar) | Propuesta | Efecto de la propuesta | Activos y registros hoy (desarrollo) |
|---|---|---|---|---|
| **Programas** en Renovaciones (`aplicaRenovacion`) | **Sí** | **No**, salvo que se decida renovar aquí las suscripciones mientras *Licencias* esté vacía | El selector de Renovaciones deja de ofrecer los 349 programas instalados (componentes de Windows, controladores, utilidades). Las suscripciones (Microsoft 365, ESET, Safetica) se registrarían como *Licencias* cuando GLPI las tenga | 349 activos; 0 renovaciones |
| **Servidores físicos** en Protección de Endpoints (`aplicaEndpoint`) | **Sí** | **Decidir según la política de antivirus/EDR.** Si los servidores tienen otra política o se miden aparte: **No**. Si entran en la misma métrica mensual que los equipos de usuario: **Sí** | La cifra «Equipos sujetos a control» (operativos de las categorías habilitadas) deja de incluir los servidores; quedan solo las *Computadoras* (26 activos en total) | 1 activo («HP-520») |
| **Servidores virtuales** en Protección de Endpoints (`aplicaEndpoint`) | **Sí** | Igual que los servidores físicos | Igual | 1 activo («VM-CONTABILIDAD») |

Si se aprueba la propuesta tal cual, después de aplicar las migraciones bastan **tres interruptores** en Catálogos > Categorías: Programas → Renovaciones = No; Servidores físicos → Protección de endpoints = No; Servidores virtuales → Protección de endpoints = No. Ninguna categoría de las tres tiene registros en esos módulos, así que no queda ningún registro en una categoría no elegible.

### Otras decisiones pendientes

1. **Programas** en Mantenimientos y en Renovaciones.
2. **Servidores** (físico y virtual) en Endpoints, y **Servidores virtuales** en Evaluación.
3. **Garantías** de Monitores y Periféricos en Renovaciones. Hoy no hay fechas de compra.
4. **Periféricos** en Mantenimientos, o reclasificar en GLPI el switch y el proyector.
5. ¿Se registrarán en GLPI los sistemas de negocio como *Appliance* («Aplicativos»)? De ello depende Evaluación.

Cualquier ajuste posterior se hace desde Catálogos, sin migración.

## Migración `20261029120000_categorias_aplicacion_modulos`

**Estado:**

- **Desarrollo y producción:** no aplicada.
- **Pruebas:** aplicada en `gestion_activos_test` (las suites e2e aplican las migraciones allí).
- **Versión del SQL: v1**, la misma que se aplicó en pruebas. Llegó a reescribirse con la matriz revisada sin comprobar antes que ya estaba aplicada; se detectó al comparar sumas de verificación y se **restauró la v1 exacta**. La suma sha256 del archivo (`7c8b037d8e4e…`) coincide de nuevo con la registrada en `_prisma_migrations` de pruebas.
- **No se vuelve a reescribir.** Las tres diferencias con la matriz (ver la leyenda de la tabla) se corrigen, cuando se aprueben, **desde Catálogos tras aplicar la migración** o con una **migración nueva** de solo `UPDATE`. Su comentario «preparadas para módulos futuros (aún sin selectores ni operaciones)» quedó desactualizado: Endpoints y Evaluación ya usan sus banderas.

`migrate deploy`, que es lo que usan las pruebas y el procedimiento, no compara sumas de verificación. `migrate dev` sí lo hace.

**SQL** (`gestion-activos-api/prisma/migrations/20261029120000_categorias_aplicacion_modulos/migration.sql`):

1. `ALTER TABLE categoria ADD COLUMN … BOOLEAN NOT NULL DEFAULT false` (×5).
2. `UPDATE categoria SET aplica… = true WHERE nombre IN (…)`: matriz v1. Respecto de la tabla, deja sin habilitar los ⏳ salvo Programas en Renovaciones y los dos tipos de servidores en Endpoints.
3. **Salvaguarda:** `UPDATE categoria c SET aplica… = true WHERE EXISTS (registros del módulo con activos de esa categoría)`.

## Migraciones de Protección de Endpoints y Evaluación (fase 1)

Las dos crean tablas nuevas y no tocan ninguna existente. Están aplicadas solo en `gestion_activos_test`.

- `20261029150000_proteccion_endpoints`: tabla `periodo_endpoint`, con un período único por año y mes (`UNIQUE (anio, mes)`). Ver [requisitos-proteccion-endpoints.md](requisitos-proteccion-endpoints.md).
- `20261029151000_evaluacion_sistemas`: tabla `evaluacion_sistema`, con una clave foránea a `activo` (`ON DELETE RESTRICT`). Ver [requisitos-evaluacion-sistemas.md](requisitos-evaluacion-sistemas.md).

**Análisis:**

- **Valores por defecto.** `false` en las cinco columnas, para las filas existentes y para las nuevas. Una categoría creada después (por el admin; GLPI no crea categorías) no es elegible hasta que se habilite.
- **Categorías existentes.**
  - Se actualizan por **nombre**, que es único (`@unique`) y coincide con las constantes de `TIPOS_GLPI`.
  - Si un entorno renombró categorías (variables `GLPI_CATEGORIA_*`), su `UPDATE` no afecta a ninguna fila y no da error: esas categorías quedarían en `false`, sin pérdida de datos, y el admin las habilita en Catálogos.
  - La salvaguarda no depende del nombre: garantiza que ningún registro existente quede en una categoría no elegible.
- **Registros y relaciones.**
  - No hay `DROP`, `DELETE` ni cambios en `activo`, en las claves foráneas ni en las tablas de los módulos.
  - Solo se escriben las cinco columnas nuevas de `categoria`.
  - Los activos conservan su categoría y los registros, su activo.
- **Si se interrumpe.** MySQL no revierte el DDL dentro de una transacción. Cada sentencia es atómica, pero el conjunto no:
  - si falla el `ALTER`, no se crea ninguna columna y la migración queda marcada como fallida;
  - si falla un `UPDATE`, las columnas ya existen, con algunos valores aplicados y otros en `false`. Los `UPDATE` son idempotentes (repetirlos da el mismo resultado), pero repetir el `ALTER` daría «columna duplicada».

  La recuperación es completar a mano los `UPDATE` que falten y marcar la migración con `prisma migrate resolve --applied 20261029120000_categorias_aplicacion_modulos`, o restaurar el respaldo previo. Por eso el respaldo verificado es obligatorio.
- **Compatibilidad.**
  - Va después de `20261027180000_retirar_verificacion_vulnerabilidades`, que también está pendiente y no toca `categoria`. `migrate deploy` aplica las dos en orden.
  - Sigue el patrón de `20261020120000` (banderas de acceso) y `20261022120000` (clase de mantenimiento): `ADD COLUMN … DEFAULT false` y `UPDATE` por nombre.
  - La comprobación posterior con `migrate diff` debe salir vacía.
- **GLPI.**
  - La sincronización **lee** las categorías con una selección explícita (`select: { id, nombre }` en `src/glpi-sync/inventario-local.ts`) y solo asigna `categoriaId` a los activos. Nunca crea ni actualiza filas de `categoria`.
  - Las banderas no se pueden sobrescribir desde GLPI. La prueba e2e «una sincronización COMPLETA conserva las banderas de aplicación por módulo» lo comprueba.
  - `glpi-sync` funciona incluso sin la migración: su última ejecución (29/10, 17:00) terminó sin errores.

## Estado de desarrollo y procedimiento de recuperación

**Actualización (29/10/2026, tarde): las cuatro migraciones están APLICADAS en desarrollo** y el backend responde 200 en todas las rutas. Ver [aplicar-migraciones-desarrollo.md](aplicar-migraciones-desarrollo.md). Lo que sigue es el estado anterior.

**Estado anterior (29/10/2026, comprobado):**

- **Migraciones pendientes, en este orden:**
  1. `20261027180000_retirar_verificacion_vulnerabilidades`
  2. `20261029120000_categorias_aplicacion_modulos`
  3. `20261029150000_proteccion_endpoints`
  4. `20261029151000_evaluacion_sistemas`
- **Backend de desarrollo** (contenedor con recarga en caliente sobre el código actual), comprobado el 29/10 con GET de auditor:
  - **500:** `/api/categorias` y `/api/activos` (falta `categoria.aplica*`); `/api/proteccion-endpoints/periodos`, `/api/evaluaciones-sistemas` y `/api/dashboard/pendientes` (faltan las tablas nuevas; el panel cuenta ya los seis módulos). Fallan Inventario, Catálogos, los selectores de activos, las dos pantallas nuevas y las insignias del inicio (que no se muestran: nunca un 0 falso).
  - **200:** Mantenimientos, Vulnerabilidades, Renovaciones, Control de acceso y `/api/activos/categorias`.
- **Datos:** ninguno alterado.

**Procedimiento (ejecutado el 29/10/2026):** [aplicar-migraciones-desarrollo.md](aplicar-migraciones-desarrollo.md), con la revisión de sumas y dependencias, los comandos exactos, el ensayo sobre una copia temporal y la recuperación. Sustituye al procedimiento que había aquí.
