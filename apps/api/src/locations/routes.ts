import { Router } from "express";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import { idParam, parse } from "../http/validate.js";
import { clearLocationRange, setLocationRange } from "./ranges.js";
import * as service from "./service.js";

// En el cuerpo JSON los identificadores ya llegan como números.
const locationId = z.number().int().positive();
const positionField = z.number().int().positive();
const nameField = z.string().trim().min(1).max(70);
export const levelNameField = z.string().trim().min(1).max(60);

export const createLocationBody = z.object({
  // null o ausente: la ubicación es una raíz.
  parent_location_id: locationId.nullable().default(null),
  name: nameField,
  level_name: levelNameField,
  level_name_override: levelNameField.nullable().optional(),
  position: positionField.optional(),
});

const locationChanges = {
  name: nameField.optional(),
  level_name: levelNameField.optional(),
  level_name_override: levelNameField.nullable().optional(),
  range_required: z.boolean().optional(),
};

const updateLocationBody = z
  .object(locationChanges)
  .refine((changes) => Object.keys(changes).length > 0, "Hay que indicar al menos un campo para modificar");

// ---------------------------------------------------------------------------
// Operaciones en lote (las usa el panel para crear la estructura de una vez)
// ---------------------------------------------------------------------------

export const MAX_BATCH_LOCATIONS = 10_000;
// Más profundidad que esta no corresponde a una sala real (Fila › Cara ›
// Mueble › Anaquel son cuatro niveles).
export const MAX_BATCH_DEPTH = 12;
// app.ts le da a esta ruta un límite de cuerpo mayor.
export const BATCH_LOCATIONS_PATH = "/schemes/:schemeId/locations/batch";

// Ubicación por crear con lo que va dentro. Los códigos y posiciones los
// calcula el backend, como en el alta individual.
const batchLocation = z.object({
  name: nameField,
  level_name: levelNameField,
  level_name_override: levelNameField.nullable().optional(),
  range_required: z.boolean().optional(),
  get children() {
    return z.array(batchLocation).optional();
  },
});

export type BatchLocationInput = z.infer<typeof batchLocation>;

export const createLocationsBody = z.object({
  // null o ausente: se crean como raíces.
  parent_location_id: locationId.nullable().default(null),
  locations: z.array(batchLocation).min(1),
});

export const updateLocationsBody = z.object({
  changes: z
    .array(
      z
        .object({ location_id: locationId, ...locationChanges })
        .refine((change) => Object.keys(change).length > 1, "Hay que indicar al menos un campo para modificar"),
    )
    .min(1)
    .max(MAX_BATCH_LOCATIONS)
    .refine(
      (changes) => new Set(changes.map((change) => change.location_id)).size === changes.length,
      "Cada ubicación puede aparecer una sola vez",
    ),
});

// Cuenta las ubicaciones y mide la profundidad del árbol sin recursión, antes
// de que Zod lo valide (recursivamente): un árbol enorme o muy profundo se
// rechaza sin recorrerlo entero.
export function checkBatchSize(body: unknown): void {
  const roots = (body as { locations?: unknown } | null)?.locations;
  if (!Array.isArray(roots)) return; // Zod informa la forma
  const pending: { item: unknown; depth: number }[] = roots.map((item) => ({ item, depth: 1 }));
  let count = 0;
  while (pending.length > 0) {
    const { item, depth } = pending.pop()!;
    count += 1;
    if (count > MAX_BATCH_LOCATIONS) {
      throw new ValidationError("Datos inválidos", [
        { path: "locations", message: `Se pueden crear hasta ${MAX_BATCH_LOCATIONS} ubicaciones por vez` },
      ]);
    }
    if (depth > MAX_BATCH_DEPTH) {
      throw new ValidationError("Datos inválidos", [
        { path: "locations", message: `El árbol puede tener hasta ${MAX_BATCH_DEPTH} niveles` },
      ]);
    }
    const children = (item as { children?: unknown } | null)?.children;
    if (Array.isArray(children)) for (const child of children) pending.push({ item: child, depth: depth + 1 });
  }
}

const moveLocationBody = z.object({
  // Obligatorio: null mueve la ubicación a la raíz.
  parent_location_id: locationId.nullable(),
  position: positionField.optional(),
});

// Texto del código tal como se escribe en el catálogo: se guarda sin cambios
// y lo valida el normalizador (normalization.md), no Zod.
const rawCode = z.string().min(1).max(120);

const rangeBody = z.object({ start: rawCode, end: rawCode });

// Todas las rutas requieren sesión: se monta con requireAuth en app.ts.
export const locationsRouter = Router();

locationsRouter.patch("/:locationId", async (req, res) => {
  const id = parse(idParam, req.params.locationId);
  res.json(await service.updateLocation(id, parse(updateLocationBody, req.body), req.userId!));
});

locationsRouter.post("/:locationId/move", async (req, res) => {
  const id = parse(idParam, req.params.locationId);
  res.json(await service.moveLocation(id, parse(moveLocationBody, req.body)));
});

// Elimina la ubicación y todo su subárbol.
locationsRouter.delete("/:locationId", async (req, res) => {
  await service.deleteLocation(parse(idParam, req.params.locationId));
  res.status(204).end();
});

// Asigna el rango { start, end } (ambos extremos incluidos). Responde 422 con
// el motivo si algún código es inválido o si el inicio va después del fin.
locationsRouter.put("/:locationId/range", async (req, res) => {
  const id = parse(idParam, req.params.locationId);
  res.json(await setLocationRange(id, parse(rangeBody, req.body), req.userId!));
});

locationsRouter.delete("/:locationId/range", async (req, res) => {
  res.json(await clearLocationRange(parse(idParam, req.params.locationId), req.userId!));
});
