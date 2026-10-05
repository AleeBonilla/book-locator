import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeAssignment, type AssignmentLocation } from "./assignment.js";

// Árbol descrito como líneas «código [marca] [rango]», p. ej. "6-1-10 * R".
// El padre se deduce del código.
function tree(...lines: string[]): AssignmentLocation[] {
  const ids = new Map<string, number>();
  return lines.map((line, index) => {
    const [code, ...flags] = line.split(" ");
    ids.set(code, index + 1);
    const parentCode = code.includes("-") ? code.slice(0, code.lastIndexOf("-")) : null;
    return {
      location_id: index + 1,
      parent_location_id: parentCode === null ? null : ids.get(parentCode)!,
      code,
      range_required: flags.includes("*"),
      has_range: flags.includes("R"),
    };
  });
}

describe("analyzeAssignment", () => {
  it("sin ubicaciones: DRAFT", () => {
    assert.equal(analyzeAssignment([]).status, "DRAFT");
  });

  it("con ubicaciones y sin rangos: LOCATIONS_DEFINED, aunque haya marcas", () => {
    assert.equal(analyzeAssignment(tree("1", "1-1 *", "1-2 *")).status, "LOCATIONS_DEFINED");
  });

  it("mínimo en los muebles, todos con rango: ASSIGNED", () => {
    const report = analyzeAssignment(
      tree("1", "1-1", "1-1-1 * R", "1-1-2 * R", "1-2", "1-2-1 * R"),
    );
    assert.equal(report.status, "ASSIGNED");
    assert.equal(report.required_count, 3);
    assert.equal(report.required_with_range, 3);
  });

  it("rangos opcionales por debajo del mínimo no cambian el resultado", () => {
    const report = analyzeAssignment(
      tree("1", "1-1 * R", "1-1-1 R", "1-1-2", "1-2 * R", "1-2-1"),
    );
    assert.equal(report.status, "ASSIGNED");
  });

  it("anaqueles vacíos por debajo del mínimo no impiden ASSIGNED", () => {
    assert.equal(analyzeAssignment(tree("1", "1-1 * R", "1-1-1", "1-1-2")).status, "ASSIGNED");
  });

  it("mínimo a distinta profundidad en ramas irregulares: ASSIGNED", () => {
    // Fila 1 › Cara › Mueble y Fila 2 › Mueble (sin caras).
    const report = analyzeAssignment(tree("1", "1-1", "1-1-1 * R", "2", "2-1 * R"));
    assert.equal(report.status, "ASSIGNED");
  });

  it("una marca sin rango: PARTIALLY_ASSIGNED, con el código pendiente", () => {
    const report = analyzeAssignment(tree("1", "1-1 * R", "1-2 *"));
    assert.equal(report.status, "PARTIALLY_ASSIGNED");
    assert.deepEqual(report.missing_ranges, ["1-2"]);
  });

  it("una hoja sin marca en su camino: PARTIALLY_ASSIGNED", () => {
    const report = analyzeAssignment(tree("1", "1-1 * R", "1-2", "1-2-1 R"));
    assert.equal(report.status, "PARTIALLY_ASSIGNED");
    assert.deepEqual(report.uncovered_leaves, ["1-2-1"]);
  });

  it("marcas anidadas: PARTIALLY_ASSIGNED", () => {
    const report = analyzeAssignment(tree("1 * R", "1-1 * R"));
    assert.equal(report.status, "PARTIALLY_ASSIGNED");
    assert.deepEqual(report.nested_marks, ["1-1"]);
  });

  it("rangos pero ninguna marca: PARTIALLY_ASSIGNED", () => {
    const report = analyzeAssignment(tree("1", "1-1 R"));
    assert.equal(report.status, "PARTIALLY_ASSIGNED");
    assert.deepEqual(report.uncovered_leaves, ["1-1"]);
  });
});
