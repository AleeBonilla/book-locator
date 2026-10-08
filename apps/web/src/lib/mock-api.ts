// API simulada para revisar el diseño sin backend. Devuelve las mismas formas
// que GET /search y GET /search/map. Se reemplaza al conectar la API real.
import { normalizeClassification } from '@classification/normalize.ts';
import { ApiError, type PathStep, type SearchResponse, type SearchResult } from './api-types.ts';

const SCHEME = { scheme_id: 1, name: 'Sala general' };
const ANAQUELES_POR_MUEBLE = 5;
const muebles = (fila: number) => (fila === 4 ? 14 : 16);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Con ?estado=no-disponible se simula que no hay esquema activo.
const unavailable = () => new URLSearchParams(location.search).get('estado') === 'no-disponible';

export async function fetchMap(): Promise<string> {
  await wait(250);
  if (unavailable()) throw new ApiError(503, 'La búsqueda no está disponible: no hay ningún esquema activo');
  // El export de Figma con las capas renombradas a loc-<código> (guia-mapas.md).
  // Se carga aparte, como llegará desde GET /search/map.
  const { default: figmaExport } = await import('../../../api/src/maps/fixtures/figma-plano-ejemplo.svg?raw');
  return figmaExport.replace(/id="\d+-(\d+-\d+-\d+)"/g, 'id="loc-$1"');
}

export async function search(code: string): Promise<SearchResponse> {
  await wait(350);
  const normalized = normalizeClassification(code);
  if (normalized.status === 'invalid') {
    throw new ApiError(422, 'Código de clasificación inválido', [{ path: 'code', message: normalized.reason }]);
  }
  if (unavailable()) throw new ApiError(503, 'La búsqueda no está disponible: no hay ningún esquema activo');

  const { prefix, ddc } = normalized.code;
  const range = { start: `${prefix}${ddc} A100`, end: `${prefix}${ddc} Z999` };
  const key = code.replace(/\s+/g, ' ').trim().toLowerCase();

  // Ejemplos fijos para revisar cada estado del diseño.
  if (key === '658.8 k87m14') {
    return response(code, true, [
      result('contains', [6, 2, 5, 2], { start: '658.8 K54mev³', end: '658.8 K87p²' }),
      result('contains', [6, 2, 5, 3], { start: '658.8 K87fu⁶', end: '658.8 L666c' }),
    ]);
  }
  if (key === '720 b12') {
    return response(code, false, [
      result('before', [4, 1, 14, 5], { start: '711.409 P451c', end: '719.8 Z99' }),
      result('after', [4, 2, 1, 1], { start: '721 A118b', end: '725.2 C177F' }),
    ]);
  }
  // Rango cargado a nivel de mueble: no hay anaquel que indicar.
  if (key === '863 m378a') {
    return response(code, true, [result('contains', [2, 2, 7], { start: '863 A100', end: '863 Z999' })]);
  }
  if (key === '001.42 h557m4') {
    return response(code, true, [result('contains', [6, 1, 10, 3], { start: '001.42A543c', end: '001.42M321m^5' })]);
  }

  // Cualquier otro código válido cae en un anaquel fijo, calculado a partir
  // del propio texto.
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const fila = (hash % 10) + 1;
  const cara = ((hash >> 4) % 2) + 1;
  const mueble = ((hash >> 5) % muebles(fila)) + 1;
  const anaquel = ((hash >> 9) % ANAQUELES_POR_MUEBLE) + 1;
  return response(code, true, [result('contains', [fila, cara, mueble, anaquel], range)]);
}

function response(code: string, found: boolean, results: SearchResult[]): SearchResponse {
  return { code, scheme: SCHEME, found, results };
}

// Arma un resultado para Fila › Cara › Mueble › Anaquel (o hasta Mueble, si
// el rango está a ese nivel). El plano dibuja los muebles, así que esa es la
// figura a resaltar.
function result(
  relation: SearchResult['relation'],
  [fila, cara, mueble, anaquel]: [number, number, number, number?],
  range: { start: string; end: string },
): SearchResult {
  const steps: [string, number, number][] = [
    ['Fila', fila, 10],
    ['Cara', cara, 2],
    ['Mueble', mueble, muebles(fila)],
  ];
  if (anaquel !== undefined) steps.push(['Anaquel', anaquel, ANAQUELES_POR_MUEBLE]);
  const segments = [fila, cara, mueble, anaquel];
  const path: PathStep[] = steps.map(([levelName, position, siblings], index) => ({
    location_id: 1000 + index,
    code: segments.slice(0, index + 1).join('-'),
    name: `${levelName} ${position}`,
    level_name: levelName,
    position,
    siblings,
  }));
  return { relation, range, path, highlight_code: path[2].code, below_highlight: path.slice(3) };
}
