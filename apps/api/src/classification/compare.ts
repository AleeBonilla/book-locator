import { compareLetters } from "./letters.js";
import type { ClassificationCode } from "./normalize.js";

// Implementación directa de docs/classification-ordering.md. Es la referencia
// contra la que se prueba la clave de sort-key.ts: la base de datos compara
// claves, no usa esta función.
export function compareClassifications(a: ClassificationCode, b: ClassificationCode): number {
  return (
    // §5 Prefijo: la cadena vacía (sin prefijo) va antes que cualquier prefijo.
    compareLetters(a.prefix, b.prefix) ||
    compareDdc(a.ddc, b.ddc) ||
    // §7 Cutter: la ausencia (cadena vacía) va antes que la presencia.
    compareLetters(a.cutterLetters, b.cutterLetters) ||
    compareDigitByDigit(a.cutterDigits, b.cutterDigits) ||
    compareEdition(a.edition, b.edition)
  );
}

// §6 Los tres primeros dígitos tienen anchura fija y los decimales se leen de
// izquierda a derecha, así que basta comparar la secuencia de dígitos.
function compareDdc(a: string, b: string): number {
  return compareDigitByDigit(a.replace(".", ""), b.replace(".", ""));
}

// Compara como fracción decimal: dígito a dígito y, si una secuencia es
// prefijo de la otra, la más corta primero (S248 < S25, E43 < E434).
function compareDigitByDigit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// §8 Por segmentos; los de letras alfabéticamente y los de dígitos por valor.
function compareEdition(a: string[], b: string[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = /^\d/.test(a[i]) ? compareNumbers(a[i], b[i]) : compareLetters(a[i], b[i]);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

// Por valor numérico sin convertir a number, para no perder precisión con
// cifras largas: sin ceros a la izquierda, más cifras significa mayor valor.
function compareNumbers(a: string, b: string): number {
  const x = a.replace(/^0+/, "");
  const y = b.replace(/^0+/, "");
  return x.length - y.length || compareDigitByDigit(x, y);
}
