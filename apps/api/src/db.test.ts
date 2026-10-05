import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import pg from "pg";
import { checkDatabase, pool, withTransaction } from "./db.js";

// Estas pruebas usan la base de desarrollo (apps/api/.env). Si no está
// levantada, se omiten en lugar de fallar.
const databaseAvailable = await checkDatabase().then(
  () => true,
  () => false,
);
const skip = databaseAvailable ? false : "PostgreSQL no disponible";

async function schemeExists(name: string): Promise<boolean> {
  const { rowCount } = await pool.query("SELECT 1 FROM schemes WHERE name = $1", [name]);
  return rowCount === 1;
}

describe("withTransaction", { skip }, () => {
  const name = `prueba-${randomUUID()}`;

  after(async () => {
    await pool.query("DELETE FROM schemes WHERE name = $1", [name]);
    await pool.end();
  });

  it("confirma los cambios si el trabajo termina bien", async () => {
    const result = await withTransaction(async (client) => {
      await client.query("INSERT INTO schemes (name) VALUES ($1)", [name]);
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(await schemeExists(name), true);
  });

  it("deshace todos los cambios si el trabajo lanza un error", async () => {
    const other = `${name}-deshecho`;
    await assert.rejects(
      withTransaction(async (client) => {
        await client.query("INSERT INTO schemes (name) VALUES ($1)", [other]);
        throw new Error("falla a mitad de camino");
      }),
      /falla a mitad de camino/,
    );
    assert.equal(await schemeExists(other), false);
  });

  it("lanza el error de una restricción diferida, que se comprueba en el COMMIT", async () => {
    const other = `${name}-diferido`;
    const error = await withTransaction(async (client) => {
      const { rows } = await client.query<{ scheme_id: number }>(
        "INSERT INTO schemes (name) VALUES ($1) RETURNING scheme_id",
        [other],
      );
      const schemeId = rows[0].scheme_id;
      // Las dos sentencias se aceptan; el trigger locations_code_hierarchy
      // rechaza el resultado recién al confirmar.
      await client.query(
        `INSERT INTO locations (location_id, scheme_id, parent_location_id, level, level_name, name, code, sort_order)
         VALUES (-1, $1, NULL, 1, 'Fila', 'Fila 1', '1', 1)`,
        [schemeId],
      );
      await client.query(
        `INSERT INTO locations (location_id, scheme_id, parent_location_id, level, level_name, name, code, sort_order)
         VALUES (-2, $1, -1, 2, 'Cara', 'Cara 1', '2-1', 1)`,
        [schemeId],
      );
    }).then(
      () => assert.fail("se esperaba un error en el COMMIT"),
      (error: unknown) => error,
    );

    assert.ok(error instanceof pg.DatabaseError);
    assert.equal(error.code, "23514");
    assert.equal(error.constraint, "locations_code_hierarchy");
    assert.equal(await schemeExists(other), false, "el esquema también se deshizo");
  });
});
