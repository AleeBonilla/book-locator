import type { ErrorRequestHandler, RequestHandler } from "express";
import pg from "pg";
import { AppError, ConflictError, InvalidInputError, NotFoundError, ValidationError } from "../errors.js";

// Toda respuesta de error de la API tiene esta forma.
export interface ErrorBody {
  error: string;
  details?: unknown;
  constraint?: string;
}

const APP_ERROR_STATUS: [typeof AppError, number][] = [
  [ValidationError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
  [InvalidInputError, 422],
];

// Violaciones de restricciones de PostgreSQL. Los servicios validan antes de
// escribir, así que llegar aquí suele indicar una carrera entre dos
// peticiones o una regla que solo garantiza la base; aun así, el cliente
// recibe una respuesta comprensible en lugar de un 500.
const PG_ERROR_STATUS: Record<string, number> = {
  "23505": 409, // unique_violation
  "23503": 409, // foreign_key_violation
  "23514": 422, // check_violation (incluye el trigger locations_code_hierarchy)
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_username_lower_unique: "Ya existe un usuario con ese nombre de usuario",
  users_email_lower_unique: "Ya existe un usuario con ese correo",
  locations_scheme_code_unique: "Ya existe una ubicación con ese código en el esquema",
  locations_sibling_sort_unique: "Ya existe una ubicación en esa posición",
  locations_code_hierarchy: "El código de la ubicación no corresponde al de su padre",
  locations_range_complete: "El rango debe tener inicio y fin, y el inicio no puede ser posterior al fin",
  schemes_single_active: "Ya hay otro esquema activo",
  schemes_active_valid: "Solo se puede activar un esquema publicado, y el esquema activo no se puede despublicar",
  schemes_published_has_map: "No se puede publicar un esquema sin plano",
};

// Errores de body-parser (express.json) cuyo mensaje original está en inglés.
const BODY_PARSER_MESSAGES: Record<string, string> = {
  "entity.parse.failed": "El cuerpo de la petición no es JSON válido",
  "entity.too.large": "El cuerpo de la petición es demasiado grande",
};

// Express reconoce un middleware de errores por sus cuatro parámetros. Con
// Express 5, los errores lanzados (o las promesas rechazadas) en manejadores
// async llegan aquí sin necesidad de try/catch ni de llamar a next(error).
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const [status, body] = toResponse(error);
  if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl} falló:`, error);
  }
  res.status(status).json(body);
};

// Para rutas que no existen; se registra después de todos los routers.
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" } satisfies ErrorBody);
};

function toResponse(error: unknown): [number, ErrorBody] {
  if (error instanceof AppError) {
    const match = APP_ERROR_STATUS.find(([type]) => error instanceof type);
    if (!match) return internalError();
    const body: ErrorBody = { error: error.message };
    if (error.details !== undefined) body.details = error.details;
    return [match[1], body];
  }

  if (error instanceof pg.DatabaseError && error.code && error.code in PG_ERROR_STATUS) {
    const constraint = error.constraint;
    const message = (constraint && CONSTRAINT_MESSAGES[constraint]) ?? "La operación no cumple una restricción de la base de datos";
    return [PG_ERROR_STATUS[error.code], { error: message, constraint }];
  }

  if (isClientHttpError(error)) {
    return [error.status, { error: BODY_PARSER_MESSAGES[error.type ?? ""] ?? "Petición inválida" }];
  }

  return internalError();
}

function internalError(): [number, ErrorBody] {
  // No se devuelven detalles: podrían revelar consultas o estructura interna.
  return [500, { error: "Error interno del servidor" }];
}

// Errores 4xx creados con el paquete http-errors (los usa body-parser).
function isClientHttpError(error: unknown): error is { status: number; type?: string } {
  if (typeof error !== "object" || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}
