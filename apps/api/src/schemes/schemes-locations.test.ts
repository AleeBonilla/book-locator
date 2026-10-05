import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db.js";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";

interface Node {
  location_id: number;
  name: string;
  code: string;
  children: Node[];
}

describe("schemes y locations (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;
  const ids = new Map<string, number>(); // nombre de la ubicación → location_id

  before(async () => {
    api = await startTestApi();
  });

  after(() => api.close());

  async function create(name: string, levelName: string, parent: string | null, position?: number) {
    const response = await api.request("POST", `/schemes/${schemeId}/locations`, {
      parent_location_id: parent === null ? null : ids.get(parent),
      name,
      level_name: levelName,
      position,
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    ids.set(name, response.body.location_id);
    return response.body;
  }

  // Árbol del esquema como líneas «código nombre», en orden.
  async function codes(): Promise<string[]> {
    const { body } = await api.request("GET", `/schemes/${schemeId}`);
    const lines: string[] = [];
    const walk = (nodes: Node[]) => {
      for (const node of nodes) {
        lines.push(`${node.code} ${node.name}`);
        walk(node.children);
      }
    };
    walk(body.locations);
    return lines;
  }

  async function status(): Promise<string> {
    return (await api.request("GET", `/schemes/${schemeId}`)).body.status;
  }

  it("rechaza peticiones sin sesión", async () => {
    assert.equal((await api.anonymous("GET", "/schemes")).status, 401);
  });

  it("crea un esquema en DRAFT y valida el nombre", async () => {
    assert.equal((await api.request("POST", "/schemes", { name: "  " })).status, 400);

    const { status: code, body } = await api.request("POST", "/schemes", {
      name: "Esquema de prueba",
      short_description: "",
    });
    assert.equal(code, 201);
    assert.equal(body.status, "DRAFT");
    assert.equal(body.short_description, null);
    assert.equal(body.has_map, false);
    schemeId = body.scheme_id;
  });

  it("genera los códigos a partir de la posición (decisión 0003 §1)", async () => {
    await create("Fila 1", "Fila", null);
    await create("Cara A", "Cara", "Fila 1");
    await create("Cara B", "Cara", "Fila 1");
    await create("Mueble A1", "Mueble", "Cara A");
    await create("Mueble A2", "Mueble", "Cara A");
    await create("Mueble B1", "Mueble", "Cara B");

    assert.deepEqual(await codes(), [
      "1 Fila 1",
      "1-1 Cara A",
      "1-1-1 Mueble A1",
      "1-1-2 Mueble A2",
      "1-2 Cara B",
      "1-2-1 Mueble B1",
    ]);
    assert.equal(await status(), "LOCATIONS_DEFINED");
  });

  it("inserta en una posición y corre a los hermanos siguientes", async () => {
    const created = await create("Mueble A0", "Mueble", "Cara A", 1);
    assert.equal(created.code, "1-1-1");
    assert.deepEqual((await codes()).slice(1, 5), [
      "1-1 Cara A",
      "1-1-1 Mueble A0",
      "1-1-2 Mueble A1",
      "1-1-3 Mueble A2",
    ]);
  });

  it("reordena hermanos y recalcula los códigos de todo el subárbol", async () => {
    const response = await api.request("POST", `/locations/${ids.get("Cara B")}/move`, {
      parent_location_id: ids.get("Fila 1"),
      position: 1,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(await codes(), [
      "1 Fila 1",
      "1-1 Cara B",
      "1-1-1 Mueble B1",
      "1-2 Cara A",
      "1-2-1 Mueble A0",
      "1-2-2 Mueble A1",
      "1-2-3 Mueble A2",
    ]);
  });

  it("mueve una ubicación hacia una posición posterior entre sus hermanos", async () => {
    await api.request("POST", `/locations/${ids.get("Mueble A0")}/move`, {
      parent_location_id: ids.get("Cara A"),
      position: 3,
    });
    assert.deepEqual((await codes()).slice(4), ["1-2-1 Mueble A1", "1-2-2 Mueble A2", "1-2-3 Mueble A0"]);
  });

  it("mueve una ubicación a otro padre (al final) y compacta el origen", async () => {
    await api.request("POST", `/locations/${ids.get("Mueble A1")}/move`, {
      parent_location_id: ids.get("Cara B"),
    });
    assert.deepEqual(await codes(), [
      "1 Fila 1",
      "1-1 Cara B",
      "1-1-1 Mueble B1",
      "1-1-2 Mueble A1",
      "1-2 Cara A",
      "1-2-1 Mueble A2",
      "1-2-2 Mueble A0",
    ]);
  });

  it("rechaza mover una ubicación dentro de su propio subárbol", async () => {
    const response = await api.request("POST", `/locations/${ids.get("Cara A")}/move`, {
      parent_location_id: ids.get("Mueble A2"),
    });
    assert.equal(response.status, 422);
  });

  it("rechaza posiciones inexistentes y padres de otro esquema", async () => {
    let response = await api.request("POST", `/schemes/${schemeId}/locations`, {
      parent_location_id: ids.get("Cara A"),
      name: "Mueble X",
      level_name: "Mueble",
      position: 9,
    });
    assert.equal(response.status, 422);

    const other = await api.request("POST", "/schemes", { name: "Otro esquema" });
    response = await api.request("POST", `/schemes/${other.body.scheme_id}/locations`, {
      parent_location_id: ids.get("Cara A"),
      name: "Intrusa",
      level_name: "Mueble",
    });
    assert.equal(response.status, 422);
  });

  it("elimina una ubicación con su subárbol y renumera a los hermanos", async () => {
    await create("Fila 2", "Fila", null);
    await create("Cara C", "Cara", "Fila 2");
    assert.equal((await api.request("DELETE", `/locations/${ids.get("Fila 1")}`)).status, 204);
    assert.deepEqual(await codes(), ["1 Fila 2", "1-1 Cara C"]);
    assert.equal((await api.request("DELETE", `/locations/${ids.get("Fila 1")}`)).status, 404);
  });

  it("marca el mínimo de asignación por nivel y reporta lo pendiente", async () => {
    await create("Mueble C1", "Mueble", "Cara C");
    await create("Mueble C2", "Mueble", "Cara C");

    const { status: code, body } = await api.request("PUT", `/schemes/${schemeId}/range-required`, {
      level_name: "Mueble",
      range_required: true,
    });
    assert.equal(code, 200);
    assert.equal(body.updated, 2);
    assert.equal(body.assignment.required_count, 2);
    assert.deepEqual(body.assignment.missing_ranges, ["1-1-1", "1-1-2"]);
    assert.equal(body.assignment.status, "LOCATIONS_DEFINED", "sin rangos todavía");
  });

  it("edita nombres sin cambiar la estructura", async () => {
    const response = await api.request("PATCH", `/locations/${ids.get("Cara C")}`, {
      name: "Cara Norte",
      level_name_override: "Costado",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.name, "Cara Norte");
    assert.equal(response.body.display_level_name, "Costado");
    assert.equal(response.body.code, "1-1");
    assert.equal((await api.request("PATCH", `/locations/${ids.get("Cara C")}`, {})).status, 400);
  });

  it("con rangos asignados, bloquea los cambios de estructura pero no los de nombre", async () => {
    // Los rangos se asignarán con su propio endpoint; aquí se cargan directo.
    await pool.query(
      `UPDATE locations
          SET range_start_raw = '001', range_end_raw = '099',
              range_start_key = '\\x00'::bytea, range_end_key = '\\x01'::bytea
        WHERE location_id = $1`,
      [ids.get("Mueble C1")],
    );

    const moved = await api.request("POST", `/locations/${ids.get("Mueble C2")}/move`, {
      parent_location_id: ids.get("Cara C"),
      position: 1,
    });
    assert.equal(moved.status, 409);
    assert.equal((await api.request("DELETE", `/locations/${ids.get("Mueble C2")}`)).status, 409);
    const created = await api.request("POST", `/schemes/${schemeId}/locations`, {
      name: "Fila 3",
      level_name: "Fila",
    });
    assert.equal(created.status, 409);

    const renamed = await api.request("PATCH", `/locations/${ids.get("Mueble C2")}`, { name: "Mueble dos" });
    assert.equal(renamed.status, 200);
  });

  it("calcula PARTIALLY_ASSIGNED y ASSIGNED a partir de las marcas y los rangos", async () => {
    // Cualquier cambio de marcas recalcula el estado.
    await api.request("PATCH", `/locations/${ids.get("Mueble C2")}`, { range_required: true });
    assert.equal(await status(), "PARTIALLY_ASSIGNED");

    await pool.query(
      `UPDATE locations
          SET range_start_raw = '100', range_end_raw = '199',
              range_start_key = '\\x02'::bytea, range_end_key = '\\x03'::bytea
        WHERE location_id = $1`,
      [ids.get("Mueble C2")],
    );
    await api.request("PATCH", `/locations/${ids.get("Mueble C2")}`, { range_required: true });
    assert.equal(await status(), "ASSIGNED");
  });

  it("un esquema publicado no admite cambios", async () => {
    await pool.query(
      "UPDATE schemes SET map_svg = '<svg/>', published_by = $2, published_at = now() WHERE scheme_id = $1",
      [schemeId, api.userId],
    );
    assert.equal((await api.request("PATCH", `/schemes/${schemeId}`, { name: "Otro nombre" })).status, 409);
    assert.equal(
      (await api.request("PATCH", `/locations/${ids.get("Mueble C2")}`, { name: "Otro" })).status,
      409,
    );
    // Se despublica para que la limpieza final pueda borrar el esquema.
    await pool.query("UPDATE schemes SET published_by = NULL, published_at = NULL WHERE scheme_id = $1", [schemeId]);
  });

  it("responde 404 a esquemas y ubicaciones inexistentes", async () => {
    assert.equal((await api.request("GET", "/schemes/999999999")).status, 404);
    assert.equal((await api.request("PATCH", "/locations/999999999", { name: "x" })).status, 404);
  });
});
