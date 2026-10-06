import { Router } from "express";
import { z } from "zod";
import { parse } from "../http/validate.js";
import * as service from "./service.js";

const searchQuery = z.object({ code: z.string().min(1).max(120) });

// Rutas públicas: no requieren sesión.
export const searchRouter = Router();

// GET /search?code=001.42H557m^4
searchRouter.get("/", async (req, res) => {
  const { code } = parse(searchQuery, req.query);
  res.json(await service.search(code));
});

// Plano del esquema activo. El navegador lo vuelve a pedir en cada visita
// (no-cache), pero si no cambió recibe un 304 sin volver a descargarlo.
searchRouter.get("/map", async (req, res) => {
  const { svg, version } = await service.activeMap();
  const etag = `"${version}"`;
  res.set({
    ETag: etag,
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.type("image/svg+xml").send(svg);
});
