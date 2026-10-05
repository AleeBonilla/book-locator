import express from "express";
import cookieParser from "cookie-parser";
import { checkDatabase } from "./db.js";
import { authRouter } from "./auth/routes.js";
import { errorHandler, notFoundHandler } from "./http/error-handler.js";

// Arma la aplicación sin ponerla a escuchar, para que las pruebas puedan
// levantarla en un puerto libre.
export function createApp(): express.Express {
  const app = express();

  // Middlewares: se ejecutan en orden para cada petición, antes de las rutas.
  app.use(express.json()); // convierte el cuerpo JSON en req.body
  app.use(cookieParser()); // convierte la cabecera Cookie en req.cookies

  app.use("/auth", authRouter);

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
