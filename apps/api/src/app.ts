import express from "express";
import cookieParser from "cookie-parser";
import { checkDatabase } from "./db.js";
import { authRouter } from "./auth/routes.js";
import { requireAuth } from "./auth/middleware.js";
import { errorHandler, notFoundHandler } from "./http/error-handler.js";
import { locationsRouter } from "./locations/routes.js";
import { schemesRouter } from "./schemes/routes.js";
import { searchRouter } from "./search/routes.js";

// Arma la aplicación sin ponerla a escuchar, para que las pruebas puedan
// levantarla en un puerto libre.
export function createApp(): express.Express {
  const app = express();

  // Middlewares: se ejecutan en orden para cada petición, antes de las rutas.
  app.use(express.json()); // convierte el cuerpo JSON en req.body
  app.use(cookieParser()); // convierte la cabecera Cookie en req.cookies

  app.use("/auth", authRouter);

  // Pública: buscar dónde está un libro y ver el plano del esquema activo.
  app.use("/search", searchRouter);

  // Administración: requireAuth corre antes que cualquier ruta de estos routers.
  app.use("/schemes", requireAuth, schemesRouter);
  app.use("/locations", requireAuth, locationsRouter);

  app.get("/", (_req, res) => {
    res.send("API funcionando");
  });

  app.get("/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ok" });
    } catch (error) {
      console.error(`No se pudo conectar a la base de datos: ${(error as Error).message}`);
      res.status(503).json({ status: "database_unavailable" });
    }
  });

  // Al final: primero las rutas inexistentes y después cualquier error lanzado
  // por un middleware o una ruta anterior.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
