import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db.js";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";

const svgOf = (codes: string[]) => ({
  contentType: "image/svg+xml",
  raw:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    codes.map((code, i) => `<rect id="loc-${code}" x="${i * 10}" width="8" height="8" fill="white"/>`).join("") +
    "</svg>",
});

describe("publicación, activación y copia (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;
  let copyId: number;
  // Activar un esquema desactiva al que estuviera activo en la base de
  // desarrollo: se recuerda para restaurarlo al terminar.
  let previouslyActive: number | null = null;
  const ids = new Map<string, number>();

  before(async () => {
    api = await startTestApi();
    const { rows } = await pool.query<{ scheme_id: number }>("SELECT scheme_id FROM schemes WHERE is_active");
    previouslyActive = rows[0]?.scheme_id ?? null;

    // Fila 1 › Cara 1 › Mueble 1, Mueble 2 (los muebles son el mínimo).
    schemeId = (await api.request("POST", "/schemes", { name: "Publicación" })).body.scheme_id;
    for (const [name, levelName, parent] of [
      ["Fila 1", "Fila", null],
      ["Cara 1", "Cara", "Fila 1"],
      ["Mueble 1", "Mueble", "Cara 1"],
      ["Mueble 2", "Mueble", "Cara 1"],
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

  after(async () => {
    await pool.query("UPDATE schemes SET is_active = false WHERE is_active AND created_by = $1", [api.userId]);
    if (previouslyActive !== null) {
      await pool.query("UPDATE schemes SET is_active = true WHERE scheme_id = $1", [previouslyActive]);
    }
    await api.close();
  });

  const publish = (id: number) => api.request("POST", `/schemes/${id}/publish`);

  it("no publica sin el mínimo de asignación completo, e informa qué falta", async () => {
    const { status, body } = await publish(schemeId);
    assert.equal(status, 409);
    assert.equal(body.error, "El esquema no cumple el mínimo de asignación");
    assert.deepEqual(body.details.assignment.missing_ranges, ["1-1-1", "1-1-2"]);
  });

  it("no publica sin plano", async () => {
    await api.request("PUT", `/locations/${ids.get("Mueble 1")}/range`, { start: "001", end: "099" });
    await api.request("PUT", `/locations/${ids.get("Mueble 2")}/range`, { start: "100", end: "199" });
    const { status, body } = await publish(schemeId);
    assert.equal(status, 409);
    assert.equal(body.error, "El esquema no tiene plano");
  });

  it("no publica si el plano no dibuja todas las ubicaciones obligatorias", async () => {
    await api.request("PUT", `/schemes/${schemeId}/map`, svgOf(["1-1-1"]));
    const { status, body } = await publish(schemeId);
    assert.equal(status, 409);
    assert.deepEqual(body.details.map.missing_required, [{ code: "1-1-2", name: "Mueble 2" }]);
  });

  it("publica cuando todo está completo", async () => {
    await api.request("PUT", `/schemes/${schemeId}/map`, svgOf(["1", "1-1", "1-1-1", "1-1-2"]));
    const { status, body } = await publish(schemeId);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.status, "ASSIGNED");
    assert.equal(body.published_by, api.userId);
    assert.ok(body.published_at);
    assert.equal((await publish(schemeId)).status, 409, "ya estaba publicado");
  });

  it("un esquema publicado queda congelado", async () => {
    const renamed = await api.request("PATCH", `/locations/${ids.get("Mueble 1")}`, { name: "Otro" });
    assert.equal(renamed.status, 409);
    const range = await api.request("DELETE", `/locations/${ids.get("Mueble 1")}/range`);
    assert.equal(range.status, 409);
  });

  it("activa el esquema publicado", async () => {
    const { status, body } = await api.request("POST", `/schemes/${schemeId}/activate`);
    assert.equal(status, 200);
    assert.equal(body.is_active, true);
  });

  it("no despublica el esquema activo", async () => {
    const { status, body } = await api.request("POST", `/schemes/${schemeId}/unpublish`);
    assert.equal(status, 409);
    assert.match(body.error, /activar otro/);
  });

  it("copia el esquema con los mismos códigos, rangos, marcas y plano, sin publicar", async () => {
    const { status, body } = await api.request("POST", `/schemes/${schemeId}/copy`, {});
    assert.equal(status, 201, JSON.stringify(body));
    copyId = body.scheme_id;
    assert.equal(body.name, "Copia de Publicación");
    assert.equal(body.status, "ASSIGNED");
    assert.equal(body.published_at, null);
    assert.equal(body.is_active, false);
    assert.equal(body.has_map, true);

    const original = (await api.request("GET", `/schemes/${schemeId}`)).body;
    const strip = (nodes: any[]): any[] =>
      nodes.map(({ code, name, range_required, range, children }) => ({
        code, name, range_required, range, children: strip(children),
      }));
    assert.deepEqual(strip(body.locations), strip(original.locations));
    assert.notEqual(body.locations[0].location_id, original.locations[0].location_id, "ids nuevos");

    const [originalMap, copiedMap] = await Promise.all([
      api.request("GET", `/schemes/${schemeId}/map`),
      api.request("GET", `/schemes/${copyId}/map`),
    ]);
    assert.equal(copiedMap.body, originalMap.body);
  });

  it("la copia se puede modificar sin afectar al original", async () => {
    const copy = (await api.request("GET", `/schemes/${copyId}`)).body;
    const mueble = copy.locations[0].children[0].children[1];
    const renamed = await api.request("PATCH", `/locations/${mueble.location_id}`, { name: "Mueble dos" });
    assert.equal(renamed.status, 200);
    const original = (await api.request("GET", `/schemes/${schemeId}`)).body;
    assert.equal(original.locations[0].children[0].children[1].name, "Mueble 2");
  });

  it("solo se activa un esquema publicado", async () => {
    assert.equal((await api.request("POST", `/schemes/${copyId}/activate`)).status, 409);
  });

  it("activar la copia publicada desactiva el original, que luego se puede despublicar", async () => {
    assert.equal((await publish(copyId)).status, 200);
    assert.equal((await api.request("POST", `/schemes/${copyId}/activate`)).body.is_active, true);
    assert.equal((await api.request("GET", `/schemes/${schemeId}`)).body.is_active, false);

    const { rows } = await pool.query("SELECT scheme_id FROM schemes WHERE is_active");
    assert.deepEqual(rows, [{ scheme_id: copyId }], "un único esquema activo");

    const unpublished = await api.request("POST", `/schemes/${schemeId}/unpublish`);
    assert.equal(unpublished.status, 200);
    assert.equal(unpublished.body.published_at, null);
    const renamed = await api.request("PATCH", `/locations/${ids.get("Mueble 1")}`, { name: "Editable otra vez" });
    assert.equal(renamed.status, 200);
  });

  it("responde 404 a esquemas inexistentes", async () => {
    for (const action of ["publish", "unpublish", "activate", "copy"]) {
      assert.equal((await api.request("POST", `/schemes/999999999/${action}`)).status, 404, action);
    }
  });
});
