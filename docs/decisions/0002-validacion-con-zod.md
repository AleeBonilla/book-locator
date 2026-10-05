# Decisión: validación de entradas HTTP con Zod

- **Estado:** Aceptada
- **Fecha:** 2026-10-05

## Contexto

Todo lo que llega a la API en `req.body`, `req.query` o `req.params` es `unknown` en la práctica: lo escribe el cliente y puede tener cualquier forma. TypeScript no lo verifica, porque sus tipos desaparecen al compilar; Express tipa `req.body` como `any`, así que el compilador acepta cualquier uso sin quejarse.

Hasta ahora el login validaba a mano:

```ts
const { identifier, password } = req.body ?? {};

if (typeof identifier !== "string" || typeof password !== "string" || !identifier || !password) {
  res.status(400).json({ error: "Se requieren identifier y password" });
  return;
}
```

Funciona para dos campos, pero los endpoints de administración (schemes, locations, rangos) reciben cuerpos más grandes, con campos opcionales, números, enteros positivos y identificadores en la ruta. Validarlos a mano tiene tres problemas:

1. **Se repite la forma dos veces:** una en los `if` y otra en el tipo de TypeScript, y nada garantiza que coincidan.
2. **Es fácil olvidar un caso:** `typeof x === "number"` acepta `NaN` e `Infinity`; un `parent_location_id` llega como texto en la URL y hay que convertirlo.
3. **Los mensajes de error no son uniformes** entre endpoints.

## Decisión

Se usa [Zod](https://zod.dev) (dependencia de producción, `zod@^4`) para validar las entradas HTTP. Cada endpoint declara un **esquema**: una descripción de la forma esperada de los datos.

```ts
const loginBody = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const parsed = loginBody.safeParse(req.body);
if (!parsed.success) { /* 400 */ }
const { identifier, password } = parsed.data; // tipo: { identifier: string; password: string }
```

- `safeParse` no lanza excepciones: devuelve `{ success: true, data }` o `{ success: false, error }`.
- `parsed.data` ya tiene el tipo correcto, deducido del esquema: la forma se declara una sola vez.
- `parsed.data` contiene solo los campos declarados; los campos de más se descartan.
- `z.coerce.number()` y similares convierten los valores de `req.params` y `req.query`, que siempre llegan como texto.

Alcance:

- **Zod valida la forma** de la entrada: tipos, campos obligatorios, longitudes.
- **Las reglas de negocio** (el árbol congelado mientras haya rangos, el estado del scheme) quedan en los servicios.
- **La validez de un código de clasificación** la decide `normalizeClassification`, no Zod, porque su motivo de rechazo es parte del contrato de `normalization.md`.
- **Las restricciones de la base de datos** siguen siendo la última defensa.
- **Los datos que no vienen por HTTP**, como los argumentos del script `create-user` (que valida con `parseArgs`), quedan fuera.

En el login la respuesta de error sigue siendo genérica, para no detallar qué campo falló. En los endpoints de administración, que usan usuarios autenticados, el 400 incluirá qué campo es inválido y por qué.

## Alternativas consideradas

- **Seguir a mano:** sin dependencias, pero con los tres problemas anteriores multiplicados por cada endpoint.
- **express-validator:** valida dentro de la cadena de middlewares, pero no deduce tipos de TypeScript; habría que declarar la forma dos veces.
- **JSON Schema con Ajv:** estándar y muy rápido, pero los esquemas son más verbosos y obtener el tipo requiere herramientas adicionales.

## Consecuencias

- Zod no tiene dependencias propias: `npm install zod` agregó una sola entrada a `package-lock.json`.
- Se migró el login como primer uso; el resto de los endpoints nace con Zod.
