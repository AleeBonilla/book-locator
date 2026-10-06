import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { pool } from "../db.js";
import { skipWithoutDatabase, startTestApi, type TestApi } from "../test-support/api.js";

// El export de Figma del plano de ejemplo y su versión con etiquetas loc-
// (las capas «4-6-1-10» renombradas a «loc-6-1-10»).
const figmaExport = readFileSync(new URL("./fixtures/figma-plano-ejemplo.svg", import.meta.url), "utf8");
const labeledExport = figmaExport.replace(/id="\d+-(\d+-\d+-\d+)"/g, 'id="loc-$1"');

const svg = (raw: string) => ({ raw, contentType: "image/svg+xml" });

describe("plano del esquema (HTTP)", { skip: skipWithoutDatabase }, () => {
  let api: TestApi;
  let schemeId: number;
  const ids = new Map<string, number>(); // código → location_id

  // Fila › Cara › Mueble con los mismos códigos que el plano de ejemplo:
  // 10 filas, 2 caras cada una y 16 muebles por cara (14 en la fila 4).
  before(async () => {
    api = await startTestApi();
    schemeId = (await api.request("POST", "/schemes", { name: "Plano de ejemplo" })).body.scheme_id;
    const add = async (parent: string | null, name: string, levelName: string) => {
      const { body } = await api.request("POST", `/schemes/${schemeId}/locations`, {
        parent_location_id: parent === null ? null : ids.get(parent),
        name,
        level_name: levelName,
      });
      ids.set(body.code, body.location_id);
      return body.code as string;
    };
    for (let fila = 1; fila <= 10; fila++) {
      const filaCode = await add(null, `Fila ${fila}`, "Fila");
      for (let cara = 1; cara <= 2; cara++) {
        const caraCode = await add(filaCode, `Cara ${cara}`, "Cara");
        for (let mueble = 1; mueble <= (fila === 4 ? 14 : 16); mueble++) {
          await add(caraCode, `Mueble ${mueble}`, "Mueble");
        }
      }
    }
    await api.request("PUT", `/schemes/${schemeId}/range-required`, { level_name: "Mueble", range_required: true });
  });

  after(() => api.close());

  it("valida sin guardar: el export sin etiquetas loc- es seguro pero deja 316 muebles sin dibujar", async () => {
    const { status, body } = await api.request("POST", `/schemes/${schemeId}/map/validate`, svg(figmaExport));
    assert.equal(status, 200);
    assert.equal(body.valid, true);
    assert.equal(body.labels, 0);
    assert.equal(body.missing_required.length, 316);
    assert.deepEqual(body.missing_required[0], { code: "1-1-1", name: "Mueble 1" });
    assert.equal(body.publishable, false);
    assert.equal((await api.request("GET", `/schemes/${schemeId}/map`)).status, 404, "no se guardó");
  });

  it("guarda el plano etiquetado: cubre todos los muebles obligatorios", async () => {
    const { status, body } = await api.request("PUT", `/schemes/${schemeId}/map`, svg(labeledExport));
    assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
    assert.equal(body.labels, 316);
    assert.deepEqual(body.unknown_codes, []);
    assert.deepEqual(body.missing_required, []);
    assert.equal(body.publishable, true);
    assert.equal((await api.request("GET", `/schemes/${schemeId}`)).body.has_map, true);
  });

  it("devuelve el plano tal como se subió, con una política que impide ejecutar código", async () => {
    const { status, body, headers } = await api.request("GET", `/schemes/${schemeId}/map`);
    assert.equal(status, 200);
    assert.equal(body, labeledExport);
    assert.match(headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(headers.get("content-security-policy") ?? "", /default-src 'none'/);
  });

  it("rechaza un plano con contenido no permitido sin reemplazar el guardado", async () => {
    const hostile = labeledExport.replace("<defs>", "<defs><script>alert(1)</script>");
    const { status, body } = await api.request("PUT", `/schemes/${schemeId}/map`, svg(hostile));
    assert.equal(status, 422);
    assert.equal(body.details.valid, false);
    assert.match(body.details.issues[0].message, /<script>/);
    assert.equal((await api.request("GET", `/schemes/${schemeId}/map`)).body, labeledExport);
  });

  it("exige Content-Type image/svg+xml y limita el tamaño", async () => {
    const asJson = await api.request("PUT", `/schemes/${schemeId}/map`, { svg: "<svg/>" });
    assert.equal(asJson.status, 415);
    const huge = await api.request("PUT", `/schemes/${schemeId}/map`, svg("x".repeat(6 * 1024 * 1024)));
    assert.equal(huge.status, 413);
  });

  it("el reporte refleja cambios posteriores en el árbol", async () => {
    // Eliminar el último mueble deja su figura con un código inexistente.
    assert.equal((await api.request("DELETE", `/locations/${ids.get("10-2-16")}`)).status, 204);
    const { body } = await api.request("GET", `/schemes/${schemeId}/map/report`);
    assert.deepEqual(body.unknown_codes.map((label: { code: string }) => label.code), ["10-2-16"]);
    assert.equal(body.publishable, false);
  });

  it("entrega la hoja de códigos en JSON y en CSV", async () => {
    const json = await api.request("GET", `/schemes/${schemeId}/codes`);
    assert.equal(json.status, 200);
    assert.deepEqual(json.body.slice(0, 3), [
      { code: "1", label: "loc-1", name: "Fila 1", path: "Fila 1", required: false },
      { code: "1-1", label: "loc-1-1", name: "Cara 1", path: "Fila 1 › Cara 1", required: false },
      { code: "1-1-1", label: "loc-1-1-1", name: "Mueble 1", path: "Fila 1 › Cara 1 › Mueble 1", required: true },
    ]);
    // Orden de árbol: 1-1-2 va antes que 1-1-10 y todo 1-… antes que 2.
    const codes = json.body.map((row: { code: string }) => row.code);
    assert.ok(codes.indexOf("1-1-2") < codes.indexOf("1-1-10"));
    assert.ok(codes.indexOf("1-2-16") < codes.indexOf("2"));

    const csv = await api.request("GET", `/schemes/${schemeId}/codes?format=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-disposition") ?? "", /codigos-esquema-\d+\.csv/);
    const lines = (csv.body as string).split("\r\n");
    assert.equal(lines[0], "﻿codigo;etiqueta;nombre;ruta;obligatoria");
    assert.equal(lines[3], "1-1-1;loc-1-1-1;Mueble 1;Fila 1 › Cara 1 › Mueble 1;sí");
  });

  it("elimina el plano", async () => {
    assert.equal((await api.request("DELETE", `/schemes/${schemeId}/map`)).status, 204);
    assert.equal((await api.request("GET", `/schemes/${schemeId}/map`)).status, 404);
  });

  it("no admite cambios de plano en un esquema publicado", async () => {
    await pool.query(
      "UPDATE schemes SET status = 'ASSIGNED', map_svg = '<svg/>', published_by = $2, published_at = now() WHERE scheme_id = $1",
      [schemeId, api.userId],
    );
    assert.equal((await api.request("PUT", `/schemes/${schemeId}/map`, svg(labeledExport))).status, 409);
    assert.equal((await api.request("DELETE", `/schemes/${schemeId}/map`)).status, 409);
    await pool.query("UPDATE schemes SET published_by = NULL, published_at = NULL WHERE scheme_id = $1", [schemeId]);
  });
});
