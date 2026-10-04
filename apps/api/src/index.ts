import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import { checkDatabase } from "./db.js";
import { authRouter } from "./auth/routes.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

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

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
