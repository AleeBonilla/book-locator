// Errores que lanzan los servicios cuando una operación no puede realizarse.
// No saben nada de HTTP: el middleware de errores (http/error-handler.ts)
// decide qué código de estado corresponde a cada uno.

export class AppError extends Error {
  constructor(
    message: string,
    // Información adicional para el cliente (p. ej. qué campos fallaron).
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// El recurso pedido no existe (o no pertenece al esquema indicado).
export class NotFoundError extends AppError {}

// La operación choca con el estado actual: p. ej. modificar un esquema
// publicado o cambiar la estructura de uno que ya tiene rangos.
export class ConflictError extends AppError {}

// Los datos tienen la forma correcta pero no cumplen una regla de negocio:
// p. ej. un código de clasificación inválido según normalization.md.
export class InvalidInputError extends AppError {}

// Los datos no tienen la forma esperada (los lanza http/validate.ts a partir
// de un esquema de Zod).
export class ValidationError extends AppError {}

// El cuerpo de la petición no viene en el formato que espera la ruta (p. ej.
// un plano que no se envía como image/svg+xml).
export class UnsupportedMediaTypeError extends AppError {}
