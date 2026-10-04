import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeClassification } from "./normalize.js";

// Salida en la forma de normalization.md §7: prefijo / ddc / cutter_letras /
// cutter_cifras / edicion, con "—" para la cadena vacía.
function summarize(raw: string): string {
  const result = normalizeClassification(raw);
  if (result.status === "invalid") return "inválido";
  const { prefix, ddc, cutterLetters, cutterDigits, edition } = result.code;
  return [prefix, ddc, cutterLetters, cutterDigits]
    .map((field) => field || "—")
    .concat(JSON.stringify(edition))
    .join(" / ");
}

function checkCases(cases: [string, string][]): void {
  for (const [raw, expected] of cases) {
    it(JSON.stringify(raw), () => assert.equal(summarize(raw), expected));
  }
}

describe("casos de referencia (normalization.md §7)", () => {
  checkCases([
    ["001.4 B268-i-2", '— / 001.4 / B / 268 / ["i","2"]'],
    ["330 R829i18", '— / 330 / R / 829 / ["i","18"]'],
    ["330 R829-i-3", '— / 330 / R / 829 / ["i","3"]'],
    ["CR863 D633e4", 'CR / 863 / D / 633 / ["e","4"]'],
    ["004.0151 S248", "— / 004.0151 / S / 248 / []"],
    ["006.6 Ll-791a", '— / 006.6 / Ll / 791 / ["a"]'],
    ["303.440.972.862.021 J61e", '— / 303.440972862021 / J / 61 / ["e"]'],
    ["352,85 G192i", '— / 352.85 / G / 192 / ["i"]'],
    ["392.37 C659ci C659ci", "inválido"],
    ["341.485 2 I-97c", '— / 341.4852 / I / 97 / ["c"]'],
    ["658. 8 S357m", '— / 658.8 / S / 357 / ["m"]'],
    ["669 C146 p", '— / 669 / C / 146 / ["p"]'],
    ["8693.7 M378a", "inválido"],
    ["658", "— / 658 / — / — / []"],
    ["CR863", "CR / 863 / — / — / []"],
    ["341.485 2", "— / 341.4852 / — / — / []"],
    ["658.", "— / 658 / — / — / []"],
    ["972.86 I584 -i", '— / 972.86 / I / 584 / ["i"]'],
    ["371.4 M M423t", "inválido"],
    ["330 R829i 18", "inválido"],
    ["658 8 S357m", '— / 658.8 / S / 357 / ["m"]'],
    ["669 p", "inválido"],
    ["669 C146/p", "inválido"],
    ["86 M378a", "inválido"],
    ["", "inválido"],
    ["ABC", "inválido"],
  ]);

  it("null", () => assert.equal(normalizeClassification(null).status, "invalid"));
});

describe("formas de escritura del inventario de estantes", () => {
  checkCases([
    // Sin espacio entre el DDC y el Cutter.
    ["001.42A543c", '— / 001.42 / A / 543 / ["c"]'],
    ["Cr8615Ch512F2024", 'Cr / 861.5 / Ch / 512 / ["F","2024"]'],
    ["669C146 p", '— / 669 / C / 146 / ["p"]'],
    // DDC sin punto: se inserta después del tercer dígito.
    ["97286O13c", '— / 972.86 / O / 13 / ["c"]'],
    ["Cr86144F363d", 'Cr / 861.44 / F / 363 / ["d"]'],
    ["920C262c", '— / 920 / C / 262 / ["c"]'],
    // Punto final pegado al Cutter.
    ["004.N822c", '— / 004 / N / 822 / ["c"]'],
    ["664.Ch478t", '— / 664 / Ch / 478 / ["t"]'],
    // Coma decimal.
    ["004,22H515c^3", '— / 004.22 / H / 515 / ["c","3"]'],
    // Superíndices.
    ["001.42H557m^4", '— / 001.42 / H / 557 / ["m","4"]'],
    ["658.8F383e⁶", '— / 658.8 / F / 383 / ["e","6"]'],
    ["658.8k87fu¹³", '— / 658.8 / k / 87 / ["fu","13"]'],
    ["512.13S-979a^13", '— / 512.13 / S / 979 / ["a","13"]'],
    ["Cr8615E779a^2021", 'Cr / 861.5 / E / 779 / ["a","2021"]'],
    // Ñ.
    ["6584038Ñ372m^13", '— / 658.4038 / Ñ / 372 / ["m","13"]'],
    // Siguen siendo inválidos.
    ["004.0195-236-i^2", "inválido"], // guion entre dígitos: falta la letra del Cutter
    ["664.815-211p", "inválido"],
    ["658.7875796c", "inválido"], // Cutter sin parte alfabética
    ["664.Q699⁴", "inválido"], // superíndice pegado a cifras del Cutter
    ["CR863D633-l^2 2025", "inválido"], // bloque numérico después del Cutter
    ["Cr863D633.o", "inválido"], // punto dentro del Cutter
    ["33.72M665g", "inválido"], // DDC con dos dígitos iniciales
    ["H685e", "inválido"],
    ["VACIO", "inválido"],
    ["330 R829i^", "inválido"], // ^ sin cifras
  ]);
});

describe("conservación del texto original", () => {
  it("devuelve el texto sin cambios en entradas válidas e inválidas", () => {
    for (const raw of ["  001.4 B268-i-2 ", "669 C146/p"]) {
      assert.equal(normalizeClassification(raw).raw, raw);
    }
  });

  it("da un motivo de rechazo", () => {
    const result = normalizeClassification("004.0195-236-i^2");
    assert.equal(result.status, "invalid");
    assert.match(result.status === "invalid" ? result.reason : "", /Guion entre dígitos/);
  });
});
