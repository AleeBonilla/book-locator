import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db.js";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";

// Fila 1 › Cara 1 › Mueble 1 › Anaquel 1   001 – 099
//                             › Anaquel 2   100 – 210   (se solapa con el 3)
//                             › Anaquel 3   200 – 299
//                  › Mueble 2               400 – 499   (hueco 300 – 399 antes)
//        › Cara 2  › Mueble 3               500 – 599
// El plano dibuja los muebles, que son el mínimo de asignación.
const TREE = [
  ["Fila 1", "Fila", null, null],
  ["Cara 1", "Cara", "Fila 1", null],
  ["Mueble 1", "Mueble", "Cara 1", null],
  ["Anaquel 1", "Anaquel", "Mueble 1", ["001", "099"]],
  ["Anaquel 2", "Anaquel", "Mueble 1", ["100", "210"]],
  ["Anaquel 3", "Anaquel", "Mueble 1", ["200", "299"]],
  ["Mueble 2", "Mueble", "Cara 1", ["400", "499"]],
  ["Cara 2", "Cara", "Fila 1", null],
  ["Mueble 3", "Mueble", "Cara 2", ["500", "599"]],
] as const;

const MAP = {
  contentType: "image/svg+xml",
  raw:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10">' +
    '<rect id="loc-1-1-1" width="8" height="8"/><rect id="loc-1-1-2" x="10" width="8" height="8"/>' +
    '<rect id="loc-1-2-1" x="20" width="8" height="8"/></svg>',
};

describe("búsqueda pública (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;
  let previouslyActive: number | null = null;
  const ids = new Map<string, number>();

  before(async () => {
    api = await startTestApi();
    // Sin esquema activo para probar el 503; el de la base de desarrollo se
    // restaura al terminar.
    const { rows } = await pool.query<{ scheme_id: number }>("SELECT scheme_id FROM schemes WHERE is_active");
    previouslyActive = rows[0]?.scheme_id ?? null;
    await pool.query("UPDATE schemes SET is_active = false WHERE is_active");

    schemeId = (await api.request("POST", "/schemes", { name: "Sala de búsqueda" })).body.scheme_id;
    for (const [name, levelName, parent] of TREE) {
      const { body } = await api.request("POST", `/schemes/${schemeId}/locations`, {
        parent_location_id: parent === null ? null : ids.get(parent),
        name,
        level_name: levelName,
      });
      ids.set(name, body.location_id);
    }
    for (const [name, , , range] of TREE) {
      if (range) await api.request("PUT", `/locations/${ids.get(name)}/range`, { start: range[0], end: range[1] });
    }
    await api.request("PUT", `/schemes/${schemeId}/range-required`, { level_name: "Mueble", range_required: true });
    await api.request("PUT", `/schemes/${schemeId}/map`, MAP);
  });

  after(async () => {
    await pool.query("UPDATE schemes SET is_active = false WHERE is_active AND created_by = $1", [api.userId]);
    if (previouslyActive !== null) {
      await pool.query("UPDATE schemes SET is_active = true WHERE scheme_id = $1", [previouslyActive]);
    }
    await api.close();
  });

  const search = (code: string) => api.anonymous("GET", `/search?code=${encodeURIComponent(code)}`);
  // Resumen de cada resultado: «relación nombre → figura resaltada».
  const summary = async (code: string) =>
    (await search(code)).body.results.map(
      (result: any) => `${result.relation} ${result.path.at(-1).name} → ${result.highlight_code}`,
    );

  it("sin esquema activo responde 503", async () => {
    assert.equal((await search("150")).status, 503);
    assert.equal((await api.anonymous("GET", "/search/map")).status, 503);
  });

  it("funciona sin sesión una vez activado el esquema", async () => {
    assert.equal((await api.request("POST", `/schemes/${schemeId}/publish`)).status, 200);
    assert.equal((await api.request("POST", `/schemes/${schemeId}/activate`)).status, 200);
    const { status, body } = await search("150");
    assert.equal(status, 200);
    assert.equal(body.found, true);
    assert.deepEqual(body.scheme, { scheme_id: schemeId, name: "Sala de búsqueda" });
  });

  it("encuentra el anaquel y resalta el mueble que lo contiene", async () => {
    const { body } = await search("150");
    assert.equal(body.results.length, 1);
    const [result] = body.results;
    assert.equal(result.relation, "contains");
    assert.deepEqual(result.range, { start: "100", end: "210" });
    assert.deepEqual(
      result.path.map((step: any) => step.code),
      ["1", "1-1", "1-1-1", "1-1-1-2"],
    );
    assert.equal(result.highlight_code, "1-1-1");
    assert.deepEqual(result.below_highlight, [
      { location_id: ids.get("Anaquel 2"), code: "1-1-1-2", name: "Anaquel 2", level_name: "Anaquel", position: 2, siblings: 3 },
    ]);
  });

  it("incluye los extremos de cada rango", async () => {
    assert.deepEqual(await summary("001"), ["contains Anaquel 1 → 1-1-1"]);
    assert.deepEqual(await summary("599"), ["contains Mueble 3 → 1-2-1"]);
  });

  it("devuelve todos los rangos que contienen el código cuando se solapan", async () => {
    assert.deepEqual(await summary("205"), ["contains Anaquel 2 → 1-1-1", "contains Anaquel 3 → 1-1-1"]);
  });

  it("si el código cae en un hueco, devuelve las vecinas de cada lado", async () => {
    const { body } = await search("350");
    assert.equal(body.found, false);
    assert.deepEqual(await summary("350"), ["before Anaquel 3 → 1-1-1", "after Mueble 2 → 1-1-2"]);
  });

  it("antes del primer rango o después del último, devuelve solo esa vecina", async () => {
    assert.deepEqual(await summary("000"), ["after Anaquel 1 → 1-1-1"]);
    assert.deepEqual(await summary("999 Z1"), ["before Mueble 3 → 1-2-1"]);
    // Con prefijo va después de todos los códigos sin prefijo.
    assert.deepEqual(await summary("A863 B1"), ["before Mueble 3 → 1-2-1"]);
  });

  it("compara con las reglas de ordenamiento, no como texto", async () => {
    // "0505" no existe como texto en ningún rango, pero es 050.5, dentro de 001 – 099.
    assert.deepEqual(await summary("0505 X1"), ["contains Anaquel 1 → 1-1-1"]);
  });

  it("rechaza códigos inválidos con el motivo, y exige el parámetro", async () => {
    const { status, body } = await search("VACIO");
    assert.equal(status, 422);
    assert.equal(body.details[0].path, "code");
    assert.equal((await api.anonymous("GET", "/search")).status, 400);
  });

  it("sirve el plano del esquema activo con caché por versión", async () => {
    const first = await api.anonymous("GET", "/search/map");
    assert.equal(first.status, 200);
    assert.equal(first.body, MAP.raw);
    assert.match(first.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    const etag = first.headers.get("etag")!;
    assert.ok(etag.includes(`${schemeId}-`), "la versión identifica esquema y publicación");

    // Si el navegador ya tiene esa versión, recibe 304 sin el archivo.
    const again = await api.anonymous("GET", "/search/map", undefined, { "If-None-Match": etag });
    assert.equal(again.status, 304);
    assert.equal(again.body, null);
  });

  it("al activar otro esquema, la búsqueda usa el nuevo", async () => {
    const copy = (await api.request("POST", `/schemes/${schemeId}/copy`, { name: "Sala renovada" })).body;
    const mueble2 = copy.locations[0].children[0].children[1];
    await api.request("PATCH", `/locations/${mueble2.location_id}`, { name: "Mueble dos" });
    await api.request("POST", `/schemes/${copy.scheme_id}/publish`);
    await api.request("POST", `/schemes/${copy.scheme_id}/activate`);

    const { body } = await search("450");
    assert.equal(body.scheme.name, "Sala renovada");
    assert.equal(body.results[0].path.at(-1).name, "Mueble dos");
  });
});
