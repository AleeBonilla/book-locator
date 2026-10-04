# BJFF Book Locator

Proyecto en español (documentación, comentarios y mensajes de commit). API en `apps/api` (Express 5 + TypeScript, ESM), PostgreSQL 16 vía `docker-compose.yaml`, esquema en `database/`.

## Forma de trabajo

- El usuario revisa el trabajo por partes: implementar en pasos pequeños y esperar su revisión antes de continuar.
- No hacer commits sin que lo pida.

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
