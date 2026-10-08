import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";
import { MAX_BATCH_DEPTH } from "./routes.js";

interface Node {
  location_id: number;
  name: string;
  code: string;
  level_name: string;
  range_required: boolean;
  children: Node[];
}

interface Item {
  name: string;
  level_name: string;
  range_required?: boolean;
  children?: Item[];
}

// Ubicaciones «Nivel 1…n», cada una con lo que devuelve `inside`.
function repeat(levelName: string, count: number, inside: () => Item[] = () => [], required = false): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${levelName} ${index + 1}`,
    level_name: levelName,
    range_required: required,
    children: inside(),
  }));
}

function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe("ubicaciones en lote (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;

  before(async () => {
    api = await startTestApi();
    schemeId = (await api.request("POST", "/schemes", { name: "Lote" })).body.scheme_id;
  });

  after(() => api.close());

  const tree = async (id = schemeId): Promise<Node[]> => (await api.request("GET", `/schemes/${id}`)).body.locations;
  const byCode = async (id = schemeId) => new Map(flatten(await tree(id)).map((node) => [node.code, node]));
  const createBatch = (parentId: number | null, locations: Item[], id = schemeId) =>
    api.request("POST", `/schemes/${id}/locations/batch`, { parent_location_id: parentId, locations });

  it("crea un árbol con ramas de distinta profundidad y calcula los códigos", async () => {
    const response = await createBatch(null, [
      ...repeat("Fila", 2, () => repeat("Cara", 2, () => repeat("Mueble", 3, () => repeat("Anaquel", 2), true))),
      ...repeat("Mesa de consulta", 1, () => repeat("Anaquel", 3)),
    ]);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.created, 2 * (1 + 2 * (1 + 3 * (1 + 2))) + (1 + 3));
    assert.deepEqual(
      response.body.locations.map((node: Node) => `${node.code} ${node.name}`),
      ["1 Fila 1", "2 Fila 2", "3 Mesa de consulta 1"],
    );

    const codes = await byCode();
    assert.equal(codes.size, 46);
    assert.equal(codes.get("2-2-3-2")?.name, "Anaquel 2");
    assert.equal(codes.get("3-3")?.name, "Anaquel 3");
    assert.equal(codes.get("1-2-3")?.range_required, true);
    assert.equal(codes.get("1-2-3-1")?.range_required, false);
  });

  it("agrega al final de las hijas que ya existen", async () => {
    const cara = (await byCode()).get("1-1")!;
    const response = await createBatch(cara.location_id, repeat("Mueble", 2, () => repeat("Anaquel", 2)));
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.deepEqual(
      response.body.locations.map((node: Node) => node.code),
      ["1-1-4", "1-1-5"],
    );
    assert.equal((await byCode()).get("1-1-5-2")?.name, "Anaquel 2");
  });

  it("crea la sala completa (1950 ubicaciones) en una petición", async () => {
    const sala = (await api.request("POST", "/schemes", { name: "Sala completa" })).body.scheme_id;
    const response = await createBatch(
      null,
      repeat("Fila", 10, () => repeat("Cara", 2, () => repeat("Mueble", 16, () => repeat("Anaquel", 5), true))),
      sala,
    );
    assert.equal(response.status, 201, JSON.stringify(response.body).slice(0, 300));
    assert.equal(response.body.created, 1950);
    assert.equal((await byCode(sala)).get("10-2-16-5")?.name, "Anaquel 5");
  });

  it("rechaza árboles demasiado profundos y datos incompletos", async () => {
    let deep: Item[] = [];
    for (let level = MAX_BATCH_DEPTH + 1; level >= 1; level--) deep = [{ name: `N ${level}`, level_name: `N${level}`, children: deep }];
    const tooDeep = await createBatch(null, deep);
    assert.equal(tooDeep.status, 400);
    assert.match(tooDeep.body.details[0].message, /niveles/);

    assert.equal((await createBatch(null, [])).status, 400);
    assert.equal((await createBatch(null, [{ name: "Fila 9", level_name: " " }])).status, 400);
  });

  it("rechaza un padre de otro esquema", async () => {
    const other = (await api.request("POST", "/schemes", { name: "Otro" })).body.scheme_id;
    const foreign = (await createBatch(null, repeat("Fila", 1), other)).body.locations[0].location_id;
    assert.equal((await createBatch(foreign, repeat("Cara", 1))).status, 422);
  });

  it("cambia nombres y niveles de varias ubicaciones a la vez", async () => {
    const codes = await byCode();
    const filas = ["1", "2"].map((code) => codes.get(code)!);
    const response = await api.request("PATCH", `/schemes/${schemeId}/locations`, {
      changes: filas.map((fila, index) => ({ location_id: fila.location_id, level_name: "Pasillo", name: `Pasillo ${index + 1}` })),
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { updated: 2 });

    const after = await byCode();
    assert.equal(after.get("2")?.name, "Pasillo 2");
    assert.equal(after.get("2")?.level_name, "Pasillo");
    assert.equal(after.get("3")?.level_name, "Mesa de consulta");
  });

  it("marca el mínimo en lote y recalcula el estado", async () => {
    const mesa = (await byCode()).get("3")!;
    const before = (await api.request("GET", `/schemes/${schemeId}`)).body.assignment.uncovered_leaves.length;
    assert.ok(before > 0);
    await api.request("PATCH", `/schemes/${schemeId}/locations`, {
      changes: [{ location_id: mesa.location_id, range_required: true }],
    });
    const assignment = (await api.request("GET", `/schemes/${schemeId}`)).body.assignment;
    assert.ok(assignment.uncovered_leaves.length < before);
  });

  it("rechaza cambios en lote inválidos", async () => {
    const fila = (await byCode()).get("1")!;
    const patch = (changes: unknown) => api.request("PATCH", `/schemes/${schemeId}/locations`, { changes });
    assert.equal((await patch([])).status, 400);
    assert.equal((await patch([{ location_id: fila.location_id }])).status, 400);
    assert.equal(
      (await patch([
        { location_id: fila.location_id, name: "A" },
        { location_id: fila.location_id, name: "B" },
      ])).status,
      400,
    );
    const outside = await patch([{ location_id: 999999999, name: "X" }]);
    assert.equal(outside.status, 422);
    assert.match(outside.body.error, /999999999/);
  });

  it("con rangos asignados, rechaza el alta pero permite renombrar", async () => {
    const anaquel = (await byCode()).get("3-1")!;
    assert.equal(
      (await api.request("PUT", `/locations/${anaquel.location_id}/range`, { start: "001", end: "002" })).status,
      200,
    );
    assert.equal((await createBatch(null, repeat("Fila", 1))).status, 409);
    const rename = await api.request("PATCH", `/schemes/${schemeId}/locations`, {
      changes: [{ location_id: anaquel.location_id, name: "Anaquel superior" }],
    });
    assert.equal(rename.status, 200);
  });
});
