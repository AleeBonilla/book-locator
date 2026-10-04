import { LETTER } from "./letters.js";

// Implementación de docs/normalization.md. Los comentarios «§x.y» remiten a
// las secciones de ese documento.

// Estructura comparable (§2). Los nombres equivalen a los del documento:
// prefijo, ddc, cutter_letras, cutter_cifras y edicion.
export interface ClassificationCode {
  prefix: string;
  ddc: string;
  cutterLetters: string;
  cutterDigits: string;
  edition: string[];
}

export type NormalizationResult =
  | { status: "valid"; raw: string; code: ClassificationCode }
  | { status: "invalid"; raw: string | null; reason: string };

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

const HEAD = new RegExp(`^([${LETTER}]*)([0-9.,]+)(.*)$`);
const DDC_ONLY_BLOCK = new RegExp(`^[${LETTER}]*[0-9.,]+$`);
const NUMERIC_FRAGMENT = /^[.,]*\d[0-9.,]*$/;
const BARE_CUTTER = new RegExp(`^[${LETTER}]+\\d+$`);
const LETTERS_ONLY = new RegExp(`^[${LETTER}]+$`);
const CUTTER = new RegExp(`^([${LETTER}]+)(\\d+)([${LETTER}][${LETTER}\\d]*)?$`);
const SEGMENTS = new RegExp(`[${LETTER}]+|\\d+`, "g");
const ALPHANUMERIC = new RegExp(`^[${LETTER}\\d]+$`);
const SINGLE_LETTER = new RegExp(`^[${LETTER}]$`);
// Un superíndice, con el carácter que lo precede: «^4» o «⁴».
const SUPERSCRIPT = new RegExp(`(.?)(?:\\^(\\d+)|([${Object.keys(SUPERSCRIPT_DIGITS).join("")}]+))`, "g");

class InvalidCode extends Error {}

export function normalizeClassification(raw: string | null | undefined): NormalizationResult {
  if (raw == null) {
    return { status: "invalid", raw: null, reason: "Entrada nula" };
  }
  try {
    return { status: "valid", raw, code: normalize(raw) };
  } catch (error) {
    if (error instanceof InvalidCode) {
      return { status: "invalid", raw, reason: error.message };
    }
    throw error;
  }
}

function normalize(raw: string): ClassificationCode {
  // §4.1 Limpieza inicial.
  let text = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (text === "") throw new InvalidCode("Entrada vacía");
  if (!/\d/.test(text)) throw new InvalidCode("La entrada no contiene dígitos");

  // §4.2 Eliminación de guiones. Un guion entre dos dígitos no separa
  // componentes: indica que falta la letra del Cutter.
  if (/\d-+\d/.test(text)) {
    throw new InvalidCode("Guion entre dígitos: falta la parte alfabética del Cutter");
  }
  text = text.replace(/-/g, "");

  // §4.3 Superíndices.
  text = replaceSuperscripts(text);

  // §4.4 Reconstrucción de bloques separados por espacios.
  const blocks = text.split(" ");
  if (DDC_ONLY_BLOCK.test(blocks[0])) {
    while (blocks.length > 1 && NUMERIC_FRAGMENT.test(blocks[1])) {
      blocks[0] += blocks.splice(1, 1)[0];
    }
  }

  // §4.6 División en componentes: el primer bloque empieza con el prefijo y
  // el DDC; lo que sigue al DDC, en ese bloque o en los siguientes, es el
  // Cutter con su edición.
  const head = HEAD.exec(blocks[0]);
  if (!head) {
    throw new InvalidCode("El código no empieza con un número DDC, con o sin prefijo");
  }
  const [, prefix, ddcText, tail] = head;
  const ddc = normalizeDdc(ddcText);
  const cutterText = joinCutterBlocks(tail, blocks.slice(1));

  if (cutterText === "") {
    return { prefix, ddc, cutterLetters: "", cutterDigits: "", edition: [] };
  }

  const cutter = CUTTER.exec(cutterText);
  if (!cutter) {
    const reason = ALPHANUMERIC.test(cutterText)
      ? "Bloque final sin Cutter completo (letras seguidas de cifras)"
      : "Caracteres no admitidos en el Cutter o la edición";
    throw new InvalidCode(`${reason}: ${JSON.stringify(cutterText)}`);
  }
  const [, cutterLetters, cutterDigits, editionText = ""] = cutter;
  return {
    prefix,
    ddc,
    cutterLetters,
    cutterDigits,
    edition: editionText.match(SEGMENTS) ?? [],
  };
}

// §4.3 Un número escrito como superíndice («m^4», «m⁴») es un segmento
// numérico de la edición y siempre sigue a una letra.
function replaceSuperscripts(text: string): string {
  const result = text.replace(SUPERSCRIPT, (_match, before: string, caret?: string, unicode?: string) => {
    if (!SINGLE_LETTER.test(before)) {
      throw new InvalidCode("Superíndice que no sigue a una letra de la edición");
    }
    const digits = caret ?? [...unicode!].map((char) => SUPERSCRIPT_DIGITS[char]).join("");
    return before + digits;
  });
  if (result.includes("^")) {
    throw new InvalidCode("Signo ^ sin cifras de superíndice");
  }
  return result;
}

// §4.5 Normalización del número DDC.
function normalizeDdc(text: string): string {
  let ddc = text.replace(/,/g, ".");
  const firstDot = ddc.indexOf(".");
  if (firstDot !== -1) {
    ddc = ddc.slice(0, firstDot + 1) + ddc.slice(firstDot + 1).replace(/\./g, "");
  }
  ddc = ddc.replace(/\.$/, "");
  if (!ddc.includes(".") && ddc.length > 3) {
    ddc = `${ddc.slice(0, 3)}.${ddc.slice(3)}`;
  }
  if (!/^\d{3}(\.\d+)?$/.test(ddc)) {
    throw new InvalidCode(`Número DDC sin exactamente tres dígitos iniciales: ${JSON.stringify(text)}`);
  }
  return ddc;
}

// §4.4 (edición separada) y §4.6: reúne el texto del Cutter y la edición a
// partir de lo que siguió al DDC en el primer bloque y de los bloques
// restantes. Solo se admite una edición de letras separada de un Cutter
// completo; cualquier otro bloque adicional invalida la entrada.
function joinCutterBlocks(tail: string, rest: string[]): string {
  const parts = tail === "" ? rest : [tail, ...rest];
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2 && BARE_CUTTER.test(parts[0]) && LETTERS_ONLY.test(parts[1])) {
    return parts[0] + parts[1];
  }
  throw new InvalidCode(`Bloques adicionales no cubiertos por la reconstrucción: ${JSON.stringify(parts.join(" "))}`);
}
