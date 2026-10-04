import { letterRank } from "./letters.js";
import type { ClassificationCode } from "./normalize.js";

// Clave binaria de ordenamiento (docs/sort-key.md). Se guarda en columnas
// BYTEA (p. ej. locations.range_start_key) y PostgreSQL la compara byte a
// byte, sin intercalación (collation): para dos códigos válidos a y b,
//   compareClassifications(a, b) y Buffer.compare(key(a), key(b))
// tienen el mismo signo, y lo mismo ocurre con <, = y > entre BYTEA en SQL.

const END = 0x00; // fin de una secuencia: va antes que cualquier contenido
const SEGMENT = 0x01; // comienzo de un segmento de la edición
const DIGIT_ZERO = 0x30; // las cifras se guardan en ASCII ("0" = 0x30)

export function classificationSortKey(code: ClassificationCode): Buffer {
  const bytes: number[] = [];

  pushLetters(bytes, code.prefix);
  pushDigits(bytes, code.ddc.replace(".", ""));
  pushLetters(bytes, code.cutterLetters);
  pushDigits(bytes, code.cutterDigits);

  for (const segment of code.edition) {
    bytes.push(SEGMENT);
    if (/^\d/.test(segment)) {
      pushNumber(bytes, segment);
    } else {
      pushLetters(bytes, segment);
    }
  }
  bytes.push(END);

  return Buffer.from(bytes);
}

// Letras como su rango (1–27, ver letters.ts) y un 0 final, de modo que una
// secuencia que es prefijo de otra queda antes y la vacía antes que todas.
function pushLetters(bytes: number[], letters: string): void {
  for (const char of letters) bytes.push(letterRank(char));
  bytes.push(END);
}

// Cifras comparadas dígito a dígito (DDC y Cutter).
function pushDigits(bytes: number[], digits: string): void {
  for (const char of digits) bytes.push(DIGIT_ZERO + Number(char));
  bytes.push(END);
}

// Cifras comparadas por valor (edición): sin ceros a la izquierda y precedidas
// por su cantidad, así 6 < 10 aunque "6" > "1" dígito a dígito.
function pushNumber(bytes: number[], digits: string): void {
  const significant = digits.replace(/^0+/, "");
  if (significant.length > 0xff) {
    throw new Error(`Segmento numérico demasiado largo para la clave: ${digits}`);
  }
  bytes.push(significant.length);
  for (const char of significant) bytes.push(DIGIT_ZERO + Number(char));
}
