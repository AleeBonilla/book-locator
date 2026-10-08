# BJFF Book Locator

Proyecto en español (documentación, comentarios y mensajes de commit). API en `apps/api` (Express 5 + TypeScript, ESM), PostgreSQL 16 vía `docker-compose.yaml`, esquema en `database/`.

## Forma de trabajo

- Cada implementación independiente va en su propia rama (p. ej. `auth-base`, `parser-normalization`, `db-location-code-trigger`); no se mezclan trabajos no relacionados en una misma rama ni se trabaja directamente en `main`.
- Dentro de la rama se permiten commits pequeños, uno por paso lógico, para que el usuario revise el historial por partes.
- Cada rama termina mergeándose a `main` cuando su trabajo está completo y probado.
- Después de mergear una rama a `main`, hacer `push` de `main` y de esa rama a `origin`.
- Las migraciones ya aplicadas (`database/NNN-*.sql`) no se editan: los cambios van en una migración nueva, que también se agrega a `docker-compose.yaml`.
- Si el usuario deja una tarea larga, hacer las preguntas al principio y luego avanzar sin esperar revisión entre pasos.

## Documentos de referencia

- `docs/normalization.md` y `docs/classification-ordering.md` son el contrato del parser de códigos (`packages/classification`, paquete `@bjff/classification` que usan la API y la web). Si cambia una regla, se actualizan el documento, la implementación y sus pruebas en el mismo cambio.
- Monorepo con npm workspaces (`packages/*`, `apps/*`): `npm install` se corre una sola vez en la raíz. `npm test` en la raíz prueba el paquete y la API; dentro de `apps/api`, solo la API.

## Objetivos de aprendizaje del usuario

El usuario quiere aprender dos conceptos. Ejemplificarlos con código real del proyecto **solo cuando corresponda** (cuando se instala/modifica una dependencia, o cuando se toca la autenticación). No mencionarlos en cada respuesta.

### 1. Cómo funcionan los administradores de paquetes (npm)

Explicar con ejemplos concretos sobre `apps/api` cuando venga al caso:

- `package.json` (qué se declara: `dependencies` vs `devDependencies`, rangos semver `^`/`~`, `scripts`, `"type": "module"`) frente a `package-lock.json` (versiones exactas resueltas e integridad; por qué se versiona).
- `npm install <pkg>` / `npm install -D <pkg>` / `npm uninstall`: qué archivos cambian y qué hay en `node_modules`.
- Dependencias transitivas, resolución y deduplicación; `npm ls`, `npm explain <pkg>`.
- `npm ci` (instalación reproducible desde el lock) frente a `npm install`.
- Paquetes de tipos `@types/*`, `npx`, `npm audit`, y por qué `node_modules` y `dist/` no se versionan.

### 2. Autenticación (conceptos de auth)

Explicar cada concepto en el momento en que aparece en la implementación, mostrando el código que lo materializa:

- Diferencia entre autenticación (quién eres) y autorización (qué puedes hacer).
- Hash de contraseñas (nunca guardar texto plano; sal, costo, por qué argon2/bcrypt y no SHA).
- Sesiones frente a tokens (JWT): dónde vive el estado, ventajas y riesgos de cada uno.
- Cookies (`HttpOnly`, `Secure`, `SameSite`), expiración, cierre de sesión y revocación.
- Middleware de Express para proteger rutas; manejo de secretos vía `.env`.
