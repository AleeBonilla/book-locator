import { normalizeClassification } from '@classification/normalize.ts';

// Líneas de la etiqueta de lomo, como se imprimen en la BJFF:
//   001.42      prefijo y número de clase
//   H557m       Cutter con las letras de la edición
//   4           número de la edición
// Devuelve null si el código no es válido.
export function spineLines(code: string): string[] | null {
  const result = normalizeClassification(code);
  if (result.status === 'invalid') return null;
  const { prefix, ddc, cutterLetters, cutterDigits, edition } = result.code;

  const lines = [`${prefix}${ddc}`];
  if (cutterLetters) {
    // Las letras de la edición que siguen al Cutter van en su misma línea; lo
    // que viene después (cifras y más segmentos), en la siguiente.
    const firstDigits = edition.findIndex((segment) => /^\d/.test(segment));
    const sameLine = firstDigits === -1 ? edition : edition.slice(0, firstDigits);
    const rest = firstDigits === -1 ? [] : edition.slice(firstDigits);
    lines.push(cutterLetters + cutterDigits + sameLine.join(''));
    if (rest.length > 0) lines.push(rest.join(' '));
  }
  return lines;
}
