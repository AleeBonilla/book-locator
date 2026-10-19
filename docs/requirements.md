# Requerimientos del sistema

Requerimientos de BJFF Book Locator reconstruidos a partir del sistema construido: el código de `apps/` y `packages/`, el esquema de `database/`, las [historias de usuario](../HISTORIAS-DE-USUARIO.md) (HU), la [referencia de la API](api.md) y las [decisiones](decisions/). Describen lo que el sistema hace hoy (octubre de 2026), no un plan.

Cada requerimiento lleva un identificador (`RF-` funcional, `RNF-` no funcional, `RT-` restricción técnica) y su trazabilidad: la historia que lo origina y dónde se implementa.

## 1. Actores

| Actor | Cuenta | Qué hace |
|---|---|---|
| Lector | No | Busca dónde está un libro por su código de clasificación. |
| Personal de la biblioteca | Sí (usuario o correo y contraseña) | Arma los esquemas de la sala (estructura, rangos, plano), los publica y elige cuál está en uso. |
| Persona que diseña el plano | No | Dibuja el plano SVG con cualquier herramienta, siguiendo la [guía de mapas](guia-mapas.md). El personal lo sube al sistema. |
| Administrador técnico | Acceso al servidor | Instala y actualiza el sistema, aplica migraciones, crea las cuentas del personal y respalda la base. |

## 2. Requerimientos funcionales

### Búsqueda pública

| ID | Requerimiento | HU | Implementación |
|---|---|---|---|
| RF-01 | Buscar un libro por su código de clasificación sin iniciar sesión, y marcar en el plano el mueble donde está. | 1 | `GET /search`, `pages/SearchPage.tsx` |
| RF-02 | Aceptar el código como aparece en el catálogo: con o sin espacios, guiones, superíndices o puntos de más. | 1 | [`normalization.md`](normalization.md), `packages/classification` |
| RF-03 | Comparar códigos según las reglas de la biblioteca (prefijo, DDC, Cutter, edición) y no alfabéticamente. | 16 | [`classification-ordering.md`](classification-ordering.md), [`sort-key.md`](sort-key.md) |
| RF-04 | Indicar el anaquel, contando desde arriba, cuando hay rangos por anaquel, y los dos anaqueles si sus rangos se superponen. | 2 | `path` y `below_highlight` de `GET /search`, `components/SearchResults.tsx` |
| RF-05 | Si el código cae entre dos rangos, señalar las ubicaciones vecinas: la que termina antes y la que empieza después. | 3 | `relation: before \| after` ([decisión 0001 §2](decisions/0001-ubicaciones-y-mapas.md)) |
| RF-06 | Explicar por qué un código no se puede interpretar, con un ejemplo de cómo escribirlo. | 4 | Respuesta **422** de `GET /search` |
| RF-07 | Acercar, alejar y desplazar el plano con mouse, gestos táctiles, teclado y botones, y acercarlo solo al resultado. | 5 | `components/MapCanvas.tsx` |
| RF-08 | Guardar la búsqueda en la dirección (`?codigo=…`), para recargarla o compartirla. | 1 | `pages/SearchPage.tsx` |
| RF-09 | Responder «no está disponible» cuando no hay ningún esquema en uso. | 13 | Respuesta **503** de `GET /search` |

### Autenticación

| ID | Requerimiento | HU | Implementación |
|---|---|---|---|
| RF-10 | Iniciar sesión con usuario o correo y contraseña, y cerrarla. | 6 | `POST /auth/login`, `/auth/logout`, `GET /auth/me`, `pages/LoginPage.tsx` |
| RF-11 | No revelar en un error de acceso si el usuario existe, ni si está deshabilitado. | 6 | `auth/routes.ts` (mismo mensaje y mismo tiempo de respuesta) |
| RF-12 | Exigir sesión en todas las rutas de administración (**401** sin ella). | 6 | `requireAuth` en `app.ts` |

### Administración de esquemas

| ID | Requerimiento | HU | Implementación |
|---|---|---|---|
| RF-13 | Crear, listar y renombrar esquemas, mostrando su estado en palabras. | 7 | `GET/POST/PATCH /schemes`, `pages/admin/SchemesPage.tsx` |
| RF-14 | Describir la sala como un árbol de ubicaciones de profundidad libre (fila, cara, mueble, anaquel…), con ramas irregulares y alta en lote. | 8 | `/schemes/:id/locations`, `/batch`, `/locations/:id`, `/move` |
| RF-15 | Generar y recalcular solos los códigos de ubicación (`6-1-10`) al crear, mover, reordenar o eliminar. | 8 | Migraciones 003 y 004 ([decisión 0003 §1](decisions/0003-codigos-minimo-y-publicacion.md)) |
| RF-16 | Definir por nivel el mínimo de ubicaciones con rango necesario para publicar. | 9 | `PUT /schemes/:id/range-required` |
| RF-17 | Asignar a cada ubicación su primer y último código, validados, con el inicio antes del fin según las reglas de ordenamiento. | 10 | `PUT/DELETE /locations/:id/range` ([decisión 0005](decisions/0005-rangos-de-ubicaciones.md)) |
| RF-18 | Calcular el rango de una ubicación cuando todos sus hijos tienen rango. | 10 | Decisión 0005 |
| RF-19 | Informar qué falta para publicar: ubicaciones sin rango, ramas sin marca y problemas del plano. | 11 | `assignment` de `GET /schemes/:id`, `components/admin/SchemeSteps.tsx` |
| RF-20 | Subir el plano en SVG (hasta 5 MB), validarlo sin guardarlo y descargar la hoja de códigos en CSV. | 12, 15 | `/schemes/:id/map`, `/map/validate`, `/map/report`, `/codes` |
| RF-21 | Publicar un esquema solo si cumple el mínimo y su plano está completo. Un esquema publicado no se edita. | 13 | `POST /schemes/:id/publish`, `/unpublish` |
| RF-22 | Tener un solo esquema en uso a la vez. El que está en uso no se puede despublicar. | 13 | `POST /schemes/:id/activate` |
| RF-23 | Copiar un esquema publicado para prepararle cambios sin afectar la búsqueda. | 14 | `POST /schemes/:id/copy` |

### Administración técnica (línea de comandos)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-24 | Crear cuentas del personal desde el servidor, pidiendo la contraseña sin mostrarla (mínimo 8 caracteres). | `scripts/create-user.ts` |
| RF-25 | Aplicar en orden las migraciones pendientes de la base, cada una en su transacción, y anotarlas. | `scripts/migrate.ts`, servicio `migrate` de [`docker-compose.prod.yaml`](../docker-compose.prod.yaml) |
| RF-26 | Cargar un esquema de demostración con la sala general, publicado y opcionalmente en uso. | `scripts/seed-demo.ts`, [`database/demo`](../database/demo/README.md) |

## 3. Requerimientos no funcionales

### Seguridad

| ID | Requerimiento | Implementación |
|---|---|---|
| RNF-01 | Las contraseñas se guardan con un hash argon2id con sal; nunca en texto plano. | `auth/password.ts` |
| RNF-02 | La sesión vive en una cookie `HttpOnly`, `SameSite=Lax` y, en producción, `Secure`. Dura 7 días y se revoca al cerrar sesión. En la base solo se guarda el hash SHA-256 del token. | `auth/session.ts`, `auth/routes.ts` |
| RNF-03 | Toda entrada HTTP se valida con un esquema antes de llegar a la lógica. | Zod ([decisión 0002](decisions/0002-validacion-con-zod.md)) |
| RNF-04 | Un plano SVG con contenido ejecutable se rechaza (lista blanca), el navegador lo vuelve a limpiar y se sirve con una política de contenido que bloquea scripts. | saxes, DOMPurify ([decisión 0006](decisions/0006-validacion-del-plano-svg.md)), HU 17 |
| RNF-05 | La base de datos garantiza la integridad aunque falle la aplicación: restricciones, claves foráneas y un disparador que valida la jerarquía de códigos. | [Decisión 0003 §5](decisions/0003-codigos-minimo-y-publicacion.md), migración 004 |
| RNF-06 | Los secretos (contraseña de la base) van en variables de entorno, fuera del repositorio. | `.env.example`, `apps/api/.env.example` |
| RNF-07 | Del sistema de lectores no se guarda ningún dato personal: la búsqueda es anónima y no deja cookies. | `search/routes.ts` |

### Rendimiento y capacidad

| ID | Requerimiento | Implementación |
|---|---|---|
| RNF-08 | Una búsqueda responde en milisegundos: PostgreSQL compara claves binarias con índices, y la API guarda en memoria el esquema en uso. | Migración 005, [decisión 0007](decisions/0007-busqueda-publica.md) |
| RNF-09 | El navegador no vuelve a descargar lo que no cambió: el plano lleva `ETag` y los archivos de la web llevan un hash en el nombre. | `GET /search/map`, [`docker/nginx.conf`](../docker/nginx.conf) |
| RNF-10 | Límites de entrada: hasta 10 000 ubicaciones y 12 niveles por alta en lote, y planos de hasta 5 MB. | `locations/routes.ts`, `maps/inspect-svg.ts` |

Las mediciones están en el [informe de alojamiento](informe-alojamiento.md#7-mediciones).

### Compatibilidad y uso

| ID | Requerimiento | Implementación |
|---|---|---|
| RNF-11 | Funciona en navegadores modernos: Chrome y Edge 111+, Firefox 114+, Safari 16.4+ (iOS 16.4+). | Objetivo por defecto de Vite 8 (`baseline-widely-available`) |
| RNF-12 | Se adapta al celular: el plano queda arriba y el resultado en una hoja inferior. | HU 5, `pages/SearchPage.css` |
| RNF-13 | La interfaz está en español y no usa terminología interna ante los lectores. | HU 1 |
| RNF-14 | La web no depende de servicios de terceros en el navegador: las fuentes y las imágenes se sirven desde el propio sistema. | `@fontsource-variable/roboto-flex`, `apps/web/src/assets` |

### Mantenibilidad y portabilidad

| ID | Requerimiento | Implementación |
|---|---|---|
| RNF-15 | El código está tipado de punta a punta (TypeScript) y las reglas de los códigos viven en un solo paquete, compartido por la API y la web. | `packages/classification` |
| RNF-16 | Hay pruebas automáticas del paquete y de la API: 113 casos en 12 archivos, que corren contra una base PostgreSQL real. | `npm test` |
| RNF-17 | Las decisiones de diseño quedan documentadas, y los cambios a la base van en migraciones numeradas que no se editan. | `docs/decisions/`, `database/NNN-*.sql` |
| RNF-18 | El sistema se instala en cualquier servidor con Docker, o en servicios gratuitos, con el mismo código. | [`instalacion-docker.md`](instalacion-docker.md), [`despliegue.md`](despliegue.md) |

## 4. Restricciones técnicas

| ID | Restricción | Motivo |
|---|---|---|
| RT-01 | Node.js 24 y PostgreSQL 16. | Versiones con las que se desarrolla y se prueba. La base usa funciones propias de PostgreSQL (PL/pgSQL, `BYTEA`, restricciones diferidas), así que no sirve otro motor. |
| RT-02 | La web y la API se sirven desde el **mismo origen**, con la API bajo `/api`. | La cookie de sesión viaja sin CORS. En producción lo resuelve nginx; en desarrollo, Vite. |
| RT-03 | El sistema ocupa la **raíz** de un dominio o subdominio, no una subcarpeta (`https://localizador.ejemplo/`, no `https://ejemplo/localizador/`). | La web pide `/api` y sus rutas (`/acceso`, `/admin`) con rutas absolutas. |
| RT-04 | El acceso del personal requiere **HTTPS**. | La cookie `Secure` solo viaja por HTTPS. La búsqueda pública funciona igual sin él. |

## 5. Fuera de alcance y pendientes

Esto no lo hace el sistema hoy:

- **Roles.** Toda cuenta habilitada tiene acceso completo a la administración. La autorización es «tiene sesión».
- **Gestión de cuentas desde el panel.** Las cuentas se crean por línea de comandos (RF-24). Deshabilitar una cuenta o cambiar una contraseña requiere SQL, y no hay recuperación de contraseña por correo.
- **Límite de peticiones por IP** en la búsqueda y en el inicio de sesión. La [decisión 0007](decisions/0007-busqueda-publica.md) lo deja pendiente; mientras tanto se puede aplicar en el proxy inverso.
- **Limpieza de sesiones vencidas.** Ya no sirven, pero quedan en la tabla `sessions`. Ocupan poco.
- **Importar los rangos desde el Excel** de la colección. Hoy se cargan desde el panel o con un script como `seed-demo`.
