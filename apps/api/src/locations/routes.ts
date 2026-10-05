import { Router } from "express";
import { z } from "zod";
import { idParam, parse } from "../http/validate.js";
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

const updateLocationBody = z
  .object({
    name: nameField.optional(),
    level_name: levelNameField.optional(),
    level_name_override: levelNameField.nullable().optional(),
    range_required: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, "Hay que indicar al menos un campo para modificar");

const moveLocationBody = z.object({
  // Obligatorio: null mueve la ubicación a la raíz.
  parent_location_id: locationId.nullable(),
  position: positionField.optional(),
});

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
