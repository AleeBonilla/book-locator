import { z } from "zod";
import { ValidationError } from "../errors.js";

// Mensajes de error de Zod en español para toda la aplicación.
z.config(z.locales.es());

export interface ValidationIssue {
  // Ruta del campo con puntos, p. ej. "range.start"; vacía si falla el valor completo.
  path: string;
  message: string;
}

// Valida `data` contra `schema` y devuelve los datos ya tipados. Si no
// cumple, lanza ValidationError con un problema por campo, que el middleware
// de errores convierte en un 400.
//
//   const body = parse(createSchemeBody, req.body);
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ValidationError("Datos inválidos", issues);
  }
  return result.data;
}

// Identificador numérico en la ruta (/schemes/:schemeId). Llega como texto,
// así que se convierte; rechaza "abc", "1.5", "0", negativos y valores que no
// caben en un INTEGER de PostgreSQL.
export const idParam = z.coerce.number().int().positive().max(2_147_483_647);
