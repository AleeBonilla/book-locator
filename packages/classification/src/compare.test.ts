import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareClassifications } from "./compare.js";
import { normalizeClassification, type ClassificationCode } from "./normalize.js";
import { classificationSortKey } from "./sort-key.js";

function parse(raw: string): ClassificationCode {
  const result = normalizeClassification(raw);
  assert.equal(result.status, "valid", `${raw}: ${result.status === "invalid" ? result.reason : ""}`);
  return result.status === "valid" ? result.code : (undefined as never);
}

// Comprueba la relación con la función de referencia y con la clave binaria.
function checkRelation(a: string, relation: "<" | "=", b: string): void {
  const x = parse(a);
  const y = parse(b);
  const [expected, inverse] = relation === "<" ? [-1, 1] : [0, 0];
  assert.equal(Math.sign(compareClassifications(x, y)), expected, "compareClassifications");
  assert.equal(Math.sign(compareClassifications(y, x)), inverse, "compareClassifications (inverso)");
  assert.equal(
    Buffer.compare(classificationSortKey(x), classificationSortKey(y)),
    expected,
    "classificationSortKey",
  );
}

// Una cadena «a < b < c» se prueba de a pares consecutivos.
function checkChain(chain: string): void {
  const tokens = chain.split(/ (<|=) /);
  for (let i = 0; i + 2 < tokens.length; i += 2) {
    checkRelation(tokens[i], tokens[i + 1] as "<" | "=", tokens[i + 2]);
  }
}

describe("casos de referencia (classification-ordering.md §10)", () => {
  // Los «...» del documento se completan con un Cutter cualquiera.
  const cases = [
    "004.0151 < 004.1",
    "620 < 620.1",
    "620.1 < 620.106",
    "658 < 658.001",
    "658 < 658 H477",
    "341.485 2 I-97c = 341.4852 I97c",
    "658 C112c < 658 C112-l",
    "658 A238 < 658 B415",
    "658 S248 < 658 S25",
    "658 E43c < 658 E434h",
    "658 K19m < 658 K199p",
    "658 H477a11 < 658 H477a12",
    "658 S492fs7 = 658 S492Fs7",
    "658 Ch456q6 < 658 Ch456q10 < 658 Ch456q11",
    "658 R829i3 < 658 R829i18",
    "658 K87m14 < 658 K87ma11",
    "658 H477a < 658 H477a11",
    "999 Z999 < A863 A100",
    "C863 Z999 < Ch863 A100",
    "A863 X1 < C863 X1 < Ch863 X1 < CR863 X1 < Cu863 X1",
    "cr863 X1 = CR863 X1",
    "001.4 B268-i-2 = 001.4 B268i2",
    "530 O-66f = 530 O66f",
    "540 S925p2 < 540 S-925t3",
  ];
  for (const chain of cases) {
    it(chain, () => checkChain(chain));
  }
});

describe("letras (classification-ordering.md §3)", () => {
  for (const chain of [
    "658 N372 < 658 Ñ372 < 658 O372",
    "658 Nz1 < 658 Ñ1",
    "658 ñ372 = 658 Ñ372",
    "658 Á1 = 658 a1",
    "658 Ll791 < 658 Lm1",
    "Pe861 A1 < Pé861 A2 < Pf861 A1",
  ]) {
    it(chain, () => checkChain(chain));
  }
});

describe("formas del inventario de estantes", () => {
  for (const chain of [
    "97286O13c = 972.86 O13c",
    "004.N822c = 004 N822c",
    "004.N822c < 004.019H236h",
    "001.42H557m^4 = 001.42 H557m4",
    "658.8k87fu⁶ < 658.8k87fu¹³",
    "658.8k55i < 658.8k55i2 < 658.8k55i4",
    "999M151t < A861B664t",
    "C86444T157u < Ch860408G643-t",
  ]) {
    it(chain, () => checkChain(chain));
  }
});

describe("clave binaria", () => {
  // Muestra variada: cualquier par debe ordenarse igual con la función de
  // referencia y con la clave.
  const sample = [
    "001.4 B268-i-2", "004.0151 S248", "004.1", "004.N822c", "004.019H236h", "006.6 Ll-791a",
    "303.440.972.862.021 J61e", "330 R829i18", "330 R829i3", "330 R829", "330 R829a", "341.4852",
    "352,85 G192i", "530 O66f", "540 S925p2", "540 S925t3", "620", "620.1", "620.106", "658",
    "658 H477", "658 H477a", "658 H477a11", "658 H477a011", "658 K87m14", "658 K87ma11", "658.001",
    "658.8k87fu¹³", "658.8k87fu⁶", "6584038Ñ372m^13", "6584038N372m", "6584038O1", "97286O13c",
    "999M151t", "A861B664t", "A863", "C863", "Ch863A467b", "CR863D633e4", "cr863D633e4",
    "Cr8615Ch512F2024", "Cu863C297s", "Pe861A841d", "V863J61c",
  ].map(parse);

  it("coincide con compareClassifications en todos los pares", () => {
    for (const a of sample) {
      for (const b of sample) {
        assert.equal(
          Buffer.compare(classificationSortKey(a), classificationSortKey(b)),
          Math.sign(compareClassifications(a, b)),
          `${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
        );
      }
    }
  });

  it("es igual para códigos equivalentes", () => {
    assert.deepEqual(classificationSortKey(parse("658 H477a11")), classificationSortKey(parse("658 H477a011")));
  });
});
