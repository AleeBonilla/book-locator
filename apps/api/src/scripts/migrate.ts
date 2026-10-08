import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pool, withTransaction } from "../db.js";

// Aplica las migraciones de database/ (NNN-*.sql, en orden) que todavía no
// se aplicaron, cada una en su propia transacción, y las anota en
// schema_migrations. Sirve para bases que no crea docker-compose, como la de
// producción en Neon:
//
//   DATABASE_URL="postgres://…" npm run migrate -w api
//
// La base local de Docker ya tiene aplicadas las migraciones (las corre
// docker-compose al crearla) pero sin anotarlas. --baseline las anota sin
// ejecutarlas, una sola vez:
//
//   npm run migrate -w api -- --baseline
const { values } = parseArgs({ options: { baseline: { type: "boolean", default: false } } });

const directory = new URL("../../../../database/", import.meta.url);

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.filename));
  const files = (await readdir(directory)).filter((file) => /^\d{3}-.+\.sql$/.test(file)).sort();
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("La base está al día: no hay migraciones pendientes.");
  }
  for (const file of pending) {
    await withTransaction(async (client) => {
      if (!values.baseline) await client.query(await readFile(new URL(file, directory), "utf8"));
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    });
    console.log(`${values.baseline ? "Anotada" : "Aplicada"}: ${file}`);
  }
} catch (error) {
  console.error(`No se pudo migrar la base: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
