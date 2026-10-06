# Decisión: capas de la API y manejo de errores

- **Estado:** Aceptada
- **Fecha:** 2026-10-05

## Contexto

`auth/routes.ts` valida, consulta la base y responde en el mismo manejador. Para dos o tres rutas alcanza, pero la administración de esquemas y ubicaciones tiene muchas reglas ([0001](0001-ubicaciones-y-mapas.md), [0003](0003-codigos-minimo-y-publicacion.md)) que conviene poder leer y probar sin pasar por HTTP.

## Decisión

### Capas

Cada módulo de la API (`schemes`, `locations`, `search`…) se divide en tres archivos:

```text
src/<módulo>/
  routes.ts    HTTP: valida la entrada con Zod, llama al servicio y elige el código de respuesta
  service.ts   reglas de negocio; no conoce Express; lanza los errores de src/errors.ts
  queries.ts   SQL; recibe un Queryable (el pool o el cliente de una transacción)
```

Piezas compartidas:

| Archivo | Contenido |
|---|---|
| `src/app.ts` | Arma la aplicación (`createApp`) sin ponerla a escuchar; `src/index.ts` solo la arranca. |
| `src/errors.ts` | Errores de dominio: `ValidationError`, `NotFoundError`, `ConflictError`, `InvalidInputError`. |
| `src/http/validate.ts` | `parse(esquema, datos)`, que lanza `ValidationError`; `idParam` para identificadores en la ruta; mensajes de Zod en español. |
| `src/http/error-handler.ts` | Middleware que convierte cualquier error en una respuesta JSON. |
| `src/db.ts` | `pool`, el tipo `Queryable` y `withTransaction`. |

Un servicio que escribe varias filas usa `withTransaction` y pasa el `client` recibido a las funciones de `queries.ts`; si algo falla, se deshace todo. Las restricciones diferidas, como el trigger `locations_code_hierarchy`, se comprueban en el `COMMIT`, así que su error sale de `withTransaction`.

### Respuestas de error

Toda respuesta de error tiene la forma `{ error, details?, constraint? }`:

| Origen | Estado | Ejemplo |
|---|---|---|
| `ValidationError` (forma de los datos) | 400 | `{ error: "Datos inválidos", details: [{ path: "name", message: "…" }] }` |
| `NotFoundError` | 404 | esquema o ubicación inexistente |
| `ConflictError` | 409 | modificar un esquema publicado |
| `InvalidInputError` (regla de negocio) | 422 | código de clasificación inválido, con su motivo en `details` |
| `UnsupportedMediaTypeError` | 415 | plano enviado con otro `Content-Type` |
| `UnavailableError` | 503 | búsqueda sin esquema activo; no se registra en el log |
| PostgreSQL `23505` (unicidad), `23503` (clave foránea) | 409 | `{ error: "Ya hay otro esquema activo", constraint: "schemes_single_active" }` |
| PostgreSQL `23514` (CHECK y triggers de validación) | 422 | `locations_code_hierarchy` |
| JSON mal formado o cuerpo demasiado grande | 400 / 413 | `{ error: "El cuerpo de la petición no es JSON válido" }` |
| Ruta inexistente | 404 | `{ error: "Ruta no encontrada" }` |
| Cualquier otro error | 500 | `{ error: "Error interno del servidor" }`, sin detalles; se registra en el log |

Los servicios validan antes de escribir; las restricciones de la base son la última defensa. Si una se dispara (por ejemplo, por dos peticiones simultáneas), el cliente recibe igualmente un mensaje comprensible. Los mensajes por restricción están en `CONSTRAINT_MESSAGES`, dentro de `error-handler.ts`; una restricción sin mensaje propio recibe uno genérico.

El login conserva su respuesta genérica (`"Se requieren identifier y password"`) para no detallar qué campo falló ([0002](0002-validacion-con-zod.md)).

### Pruebas

- **Funciones puras** (`classification`): pruebas unitarias.
- **Middleware de errores:** una app mínima levantada en un puerto libre y consultada con `fetch`.
- **Servicios y consultas:** contra el PostgreSQL de desarrollo. Las pruebas se omiten si la base no está disponible y no dejan datos: deshacen sus cambios o eliminan lo que crearon.
- **Un archivo de prueba a la vez** (`--test-concurrency=1`): varias pruebas activan esquemas, y solo puede haber uno activo en toda la base, así que en paralelo se pisarían. Las que activan uno restauran al terminar el que estaba activo en la base de desarrollo.

## Consecuencias

- Express 5 envía al middleware de errores los errores de los manejadores `async`, así que las rutas no necesitan `try/catch`.
- `/health` sigue manejando su propio error para responder 503.
