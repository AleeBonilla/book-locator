import express from "express";
import "dotenv/config";
import { checkDatabase } from "./db.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

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
