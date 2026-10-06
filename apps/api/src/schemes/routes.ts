import { Router } from "express";
import { z } from "zod";
import { idParam, parse } from "../http/validate.js";
import { createLocation, setRangeRequiredByLevel } from "../locations/service.js";
import { createLocationBody, levelNameField } from "../locations/routes.js";
import { mapsRouter } from "../maps/routes.js";
import { activateScheme, copyScheme, publishScheme, unpublishScheme } from "./publication.js";
import * as service from "./service.js";

const nameField = z.string().trim().min(1).max(80);
// Una descripción vacía se guarda como NULL.
const descriptionField = z
  .string()
  .trim()
  .max(255)
  .nullable()
  .transform((value) => (value === "" ? null : value));

const createSchemeBody = z.object({
  name: nameField,
  short_description: descriptionField.optional(),
});

const updateSchemeBody = z
  .object({
    name: nameField.optional(),
    short_description: descriptionField.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, "Hay que indicar al menos un campo para modificar");

const copySchemeBody = z.object({ name: nameField.optional() });

const rangeRequiredBody = z.object({
  level_name: levelNameField,
  range_required: z.boolean(),
});

// Todas las rutas requieren sesión: se monta con requireAuth en app.ts.
export const schemesRouter = Router();

schemesRouter.get("/", async (_req, res) => {
  res.json(await service.listSchemes());
});

schemesRouter.post("/", async (req, res) => {
  const body = parse(createSchemeBody, req.body);
  res.status(201).json(await service.createScheme(body, req.userId!));
});

// El esquema con su árbol de ubicaciones y el estado del mínimo de asignación.
schemesRouter.get("/:schemeId", async (req, res) => {
  res.json(await service.getScheme(parse(idParam, req.params.schemeId)));
});

schemesRouter.patch("/:schemeId", async (req, res) => {
  const schemeId = parse(idParam, req.params.schemeId);
  res.json(await service.updateScheme(schemeId, parse(updateSchemeBody, req.body)));
});

schemesRouter.post("/:schemeId/locations", async (req, res) => {
  const schemeId = parse(idParam, req.params.schemeId);
  const body = parse(createLocationBody, req.body);
  res.status(201).json(await createLocation(schemeId, body, req.userId!));
});

// Marca o desmarca como mínimo de asignación todas las ubicaciones de un nivel.
schemesRouter.put("/:schemeId/range-required", async (req, res) => {
  const schemeId = parse(idParam, req.params.schemeId);
  res.json(await setRangeRequiredByLevel(schemeId, parse(rangeRequiredBody, req.body), req.userId!));
});

// Publicación (decisión 0003 §4). Si el esquema no está listo, publish
// responde 409 con el detalle de lo que falta (assignment o map).
schemesRouter.post("/:schemeId/publish", async (req, res) => {
  res.json(await publishScheme(parse(idParam, req.params.schemeId), req.userId!));
});

schemesRouter.post("/:schemeId/unpublish", async (req, res) => {
  res.json(await unpublishScheme(parse(idParam, req.params.schemeId)));
});

// Lo convierte en el esquema de la búsqueda pública y desactiva el anterior.
schemesRouter.post("/:schemeId/activate", async (req, res) => {
  res.json(await activateScheme(parse(idParam, req.params.schemeId)));
});

// Copia con estructura, códigos, marcas, rangos y plano; sin publicar.
schemesRouter.post("/:schemeId/copy", async (req, res) => {
  const schemeId = parse(idParam, req.params.schemeId);
  res.status(201).json(await copyScheme(schemeId, parse(copySchemeBody, req.body ?? {}), req.userId!));
});

// Plano del esquema y hoja de códigos (/:schemeId/map, /:schemeId/codes).
schemesRouter.use("/:schemeId", mapsRouter);
