import express, { Router, type Request } from "express";
import { z } from "zod";
import { UnsupportedMediaTypeError } from "../errors.js";
import { idParam, parse } from "../http/validate.js";
import { MAX_MAP_BYTES } from "./inspect-svg.js";
import * as service from "./service.js";

// El plano viaja como el archivo SVG tal cual, no dentro de un JSON.
const svgBody = express.text({ type: "image/svg+xml", limit: MAX_MAP_BYTES });

function svgFrom(req: Request): string {
  if (typeof req.body !== "string") {
    throw new UnsupportedMediaTypeError("El plano debe enviarse como archivo SVG, con Content-Type: image/svg+xml");
  }
  return req.body;
}

const codesQuery = z.object({ format: z.enum(["json", "csv"]).default("json") });

// Se monta en schemesRouter bajo /:schemeId (mergeParams da acceso a ese
// parámetro); requiere sesión.
export const mapsRouter = Router({ mergeParams: true });

const schemeIdOf = (req: Request) => parse(idParam, (req.params as { schemeId: string }).schemeId);

// Sube o reemplaza el plano. 422 si el contenido no es aceptable; si lo es,
// devuelve el reporte de etiquetas (que puede impedir publicar).
mapsRouter.put("/map", svgBody, async (req, res) => {
  res.json(await service.uploadMap(schemeIdOf(req), svgFrom(req)));
});

// Valida un plano sin guardarlo.
mapsRouter.post("/map/validate", svgBody, async (req, res) => {
  res.json(await service.validateMap(schemeIdOf(req), svgFrom(req)));
});

mapsRouter.get("/map", async (req, res) => {
  const svg = await service.getMap(schemeIdOf(req));
  // Si alguien abre esta dirección directamente en el navegador, la política
  // de contenido impide ejecutar código aunque algo se le hubiera escapado
  // a la validación.
  res
    .type("image/svg+xml")
    .set({
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    })
    .send(svg);
});

// Reporte del plano guardado frente al árbol actual del esquema.
mapsRouter.get("/map/report", async (req, res) => {
  res.json(await service.getMapReport(schemeIdOf(req)));
});

mapsRouter.delete("/map", async (req, res) => {
  await service.deleteMap(schemeIdOf(req));
  res.status(204).end();
});

// Hoja de códigos para quien diseña el plano. Con ?format=csv se descarga
// para abrirla en una planilla.
mapsRouter.get("/codes", async (req, res) => {
  const { format } = parse(codesQuery, req.query);
  const rows = await service.getCodeSheet(schemeIdOf(req));
  if (format === "json") {
    res.json(rows);
    return;
  }
  const header = ["codigo", "etiqueta", "nombre", "ruta", "obligatoria"];
  const lines = rows.map((row) =>
    [row.code, row.label, row.name, row.path, row.required ? "sí" : "no"].map(csvField).join(";"),
  );
  res
    .type("text/csv; charset=utf-8")
    .attachment(`codigos-esquema-${schemeIdOf(req)}.csv`)
    // La marca BOM hace que Excel reconozca el UTF-8 (tildes y «›»); el punto
    // y coma es el separador que espera Excel con configuración regional en
    // español.
    .send("﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n");
});

// Entrecomilla los campos que lo necesitan, y antepone un apóstrofo a los que
// empiezan como una fórmula para que la planilla no los ejecute.
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
