// Letras admitidas en prefijos, Cutter y edición: el alfabeto latino básico,
// la Ñ y las vocales con tilde o diéresis. Se usa dentro de clases de
// expresiones regulares: `[${LETTER}]`.
export const LETTER = "A-Za-zÑñÁÉÍÓÚÜáéíóúü";

// Rango de cada letra al comparar (normalization.md §4.6 y
// classification-ordering.md §3): sin distinguir mayúsculas, las vocales con
// tilde valen como su vocal base y la Ñ va entre la N y la O. Los rangos
// empiezan en 1 para que el 0 quede libre como «fin de secuencia».
const ALPHABET = "abcdefghijklmnñopqrstuvwxyz";
const ACCENTED: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };

export function letterRank(char: string): number {
  const lower = char.toLowerCase();
  const rank = ALPHABET.indexOf(ACCENTED[lower] ?? lower);
  if (rank === -1) {
    throw new Error(`Carácter no admitido como letra: ${JSON.stringify(char)}`);
  }
  return rank + 1;
}

// Compara dos secuencias de letras carácter por carácter; si una es prefijo de
// la otra, la más corta va primero.
export function compareLetters(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = letterRank(a[i]) - letterRank(b[i]);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}
