// Lo que sirve tanto en la API como en el navegador: normalizar un código
// (docs/normalization.md) y compararlo (docs/classification-ordering.md).
// La clave de ordenamiento binaria usa Buffer, de Node, y se importa aparte:
// @bjff/classification/sort-key.
export { normalizeClassification, type ClassificationCode, type NormalizationResult } from "./normalize.js";
export { compareClassifications } from "./compare.js";
