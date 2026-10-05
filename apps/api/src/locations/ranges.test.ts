import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { normalizeClassification } from "../classification/normalize.js";
import { classificationSortKey } from "../classification/sort-key.js";
import { pool } from "../db.js";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";

describe("rangos de ubicaciones (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;
  const ids = new Map<string, number>();

  // Fila 1 › Cara 1 › Mueble 1, Mueble 2
  //        › Cara 2 › Mueble 3
  before(async () => {
    api = await startTestApi();
    schemeId = (await api.request("POST", "/schemes", { name: "Rangos" })).body.scheme_id;
    for (const [name, levelName, parent] of [
      ["Fila 1", "Fila", null],
      ["Cara 1", "Cara", "Fila 1"],
      ["Mueble 1", "Mueble", "Cara 1"],
      ["Mueble 2", "Mueble", "Cara 1"],
      ["Cara 2", "Cara", "Fila 1"],
      ["Mueble 3", "Mueble", "Cara 2"],
    ] as const) {
      const { body } = await api.request("POST", `/schemes/${schemeId}/locations`, {
        parent_location_id: parent === null ? null : ids.get(parent),
        name,
        level_name: levelName,
      });
      ids.set(name, body.location_id);
    }
    await api.request("PUT", `/schemes/${schemeId}/range-required`, { level_name: "Mueble", range_required: true });
  });

  after(() => api.close());

  const setRange = (name: string, start: string, end: string) =>
    api.request("PUT", `/locations/${ids.get(name)}/range`, { start, end });
  const clearRange = (name: string) => api.request("DELETE", `/locations/${ids.get(name)}/range`);

  async function ranges(): Promise<Record<string, string | null>> {
    const { rows } = await pool.query<{ name: string; start: string | null; end: string | null }>(
      "SELECT name, range_start_raw AS start, range_end_raw AS end FROM locations WHERE scheme_id = $1",
      [schemeId],
    );
    return Object.fromEntries(rows.map((row) => [row.name, row.start === null ? null : `${row.start} – ${row.end}`]));
  }

  const status = async () => (await api.request("GET", `/schemes/${schemeId}`)).body.status;

  it("rechaza códigos inválidos con el motivo de cada extremo", async () => {
    const { status: code, body } = await setRange("Mueble 1", "004.0195-236-i^2", "VACIO");
    assert.equal(code, 422);
    assert.deepEqual(
      body.details.map((issue: { path: string }) => issue.path),
      ["start", "end"],
    );
    assert.match(body.details[0].message, /Guion entre dígitos/);
  });

  it("rechaza un inicio posterior al fin según las reglas de ordenamiento", async () => {
    // Como texto "S25" > "S248", pero como Cutter S248 < S25.
    const { status: code, body } = await setRange("Mueble 1", "658 S25", "658 S248");
    assert.equal(code, 422);
    assert.match(body.error, /va después de su fin/);
  });

  it("guarda el texto sin cambios y la clave calculada por el parser", async () => {
    const { status: code, body } = await setRange("Mueble 1", "001.42A543c", "001.42H557m^4");
    assert.equal(code, 200, JSON.stringify(body));
    assert.deepEqual(body.range, { start: "001.42A543c", end: "001.42H557m^4" });

    const { rows } = await pool.query<{ start_key: Buffer }>(
      "SELECT range_start_key AS start_key FROM locations WHERE location_id = $1",
      [ids.get("Mueble 1")],
    );
    const expected = normalizeClassification("001.42A543c");
    assert.equal(expected.status, "valid");
    assert.deepEqual(rows[0].start_key, classificationSortKey(expected.status === "valid" ? expected.code : (null as never)));
    assert.equal(await status(), "PARTIALLY_ASSIGNED");
  });

  it("cuando todos los hijos tienen rango, el padre recibe el inicio del primero y el fin del último", async () => {
    await setRange("Mueble 2", "001.434G984a^2", "001.64M285d^3");
    const after = await ranges();
    assert.equal(after["Cara 1"], "001.42A543c – 001.64M285d^3");
    assert.equal(after["Fila 1"], null, "la Cara 2 todavía no tiene rango");
  });

  it("propaga hacia arriba mientras todos los hijos tengan rango y llega a ASSIGNED", async () => {
    await setRange("Mueble 3", "003.3A468-s", "004.N822c");
    const after = await ranges();
    assert.equal(after["Cara 2"], "003.3A468-s – 004.N822c");
    assert.equal(after["Fila 1"], "001.42A543c – 004.N822c");
    assert.equal(await status(), "ASSIGNED");
  });

  it("recalcula los rangos calculados cuando cambia el de un hijo", async () => {
    await setRange("Mueble 2", "001.434G984a^2", "002 Z1");
    assert.equal((await ranges())["Cara 1"], "001.42A543c – 002 Z1");
  });

  it("no permite cargar ni borrar a mano un rango calculado", async () => {
    assert.equal((await setRange("Cara 1", "001", "999")).status, 409);
    assert.equal((await clearRange("Fila 1")).status, 409);
  });

  it("al borrar el rango de un hijo, borra los rangos calculados hacia arriba", async () => {
    const { status: code, body } = await clearRange("Mueble 3");
    assert.equal(code, 200);
    assert.equal(body.range, null);
    const after = await ranges();
    assert.equal(after["Cara 2"], null);
    assert.equal(after["Fila 1"], null);
    assert.equal(after["Cara 1"], "001.42A543c – 002 Z1", "la otra rama no cambia");
    assert.equal(await status(), "PARTIALLY_ASSIGNED");
  });

  it("un padre puede tener rango propio mientras sus hijos no estén completos, y luego lo reemplazan", async () => {
    assert.equal((await setRange("Fila 1", "001", "005")).status, 200);
    assert.equal((await ranges())["Fila 1"], "001 – 005");

    await setRange("Mueble 3", "003.3A468-s", "004.N822c");
    assert.equal((await ranges())["Fila 1"], "001.42A543c – 004.N822c");
  });

  it("rechaza un rango que dejaría invertido el del padre, sin guardar nada", async () => {
    await clearRange("Mueble 3");
    // Mueble 3 terminaría antes de que empiece Mueble 1: el rango de la Fila
    // quedaría invertido.
    const { status: code, body } = await setRange("Mueble 3", "000 A1", "000 A2");
    assert.equal(code, 422);
    assert.match(body.error, /quedaría invertido/);
    assert.equal((await ranges())["Mueble 3"], null);
  });

  it("borrar un rango que no existe no hace nada", async () => {
    assert.equal((await clearRange("Mueble 3")).status, 200);
  });

  it("en un esquema publicado no se pueden cambiar rangos", async () => {
    await pool.query(
      "UPDATE schemes SET status = 'ASSIGNED', map_svg = '<svg/>', published_by = $2, published_at = now() WHERE scheme_id = $1",
      [schemeId, api.userId],
    );
    assert.equal((await setRange("Mueble 3", "003", "004")).status, 409);
    await pool.query("UPDATE schemes SET published_by = NULL, published_at = NULL WHERE scheme_id = $1", [schemeId]);
  });
});
