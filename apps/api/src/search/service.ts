import { normalizeClassification } from "../classification/normalize.js";
import { classificationSortKey } from "../classification/sort-key.js";
import { pool } from "../db.js";
import { InvalidInputError, UnavailableError } from "../errors.js";
import { compareCodes } from "../locations/codes.js";
import type { LocationRow } from "../locations/queries.js";
import { loadActiveScheme, type ActiveSchemeSnapshot } from "./active-scheme.js";
import { findRangeMatches } from "./queries.js";

// Búsqueda pública (decisiones 0001 §2 y 0003 §3).

export interface PathStep {
  location_id: number;
  code: string;
  name: string;
  level_name: string; // nombre del nivel que se muestra (con override)
  position: number; // sort_order: 1 = primero (en un mueble, el anaquel superior)
  siblings: number; // cuántas ubicaciones hay en ese nivel bajo el mismo padre
}

export interface SearchResult {
  // contains: el rango contiene el código. before / after: el código cae en un
  // hueco y esta es la ubicación que termina justo antes o empieza justo después.
  relation: "contains" | "before" | "after";
  range: { start: string; end: string };
  // Desde la raíz hasta la ubicación encontrada.
  path: PathStep[];
  // Figura del plano que hay que resaltar: la de la ubicación o la de su
  // ancestro dibujado más cercano. null solo si nada de su rama está dibujado.
  highlight_code: string | null;
  // Tramo de la ruta por debajo de la figura resaltada, para describirlo con
  // texto («Anaquel 3, tercero de arriba hacia abajo»).
  below_highlight: PathStep[];
}

export interface SearchResponse {
  code: string;
  scheme: { scheme_id: number; name: string };
  // Al menos un rango contiene el código.
  found: boolean;
  results: SearchResult[];
}

export async function search(code: string): Promise<SearchResponse> {
  const normalized = normalizeClassification(code);
  if (normalized.status === "invalid") {
    throw new InvalidInputError("Código de clasificación inválido", [{ path: "code", message: normalized.reason }]);
  }

  const scheme = await activeSchemeOrFail();
  const matches = await findRangeMatches(pool, scheme.scheme_id, classificationSortKey(normalized.code));

  const results: SearchResult[] = matches.containing
    .map((id) => describe(scheme, id, "contains"))
    .sort((a, b) => compareCodes(a.path.at(-1)!.code, b.path.at(-1)!.code));
  if (matches.before !== null) results.push(describe(scheme, matches.before, "before"));
  if (matches.after !== null) results.push(describe(scheme, matches.after, "after"));

  return {
    code,
    scheme: { scheme_id: scheme.scheme_id, name: scheme.name },
    found: matches.containing.length > 0,
    results,
  };
}

// Plano del esquema activo, para la página pública.
export async function activeMap(): Promise<{ svg: string; version: string }> {
  const scheme = await activeSchemeOrFail();
  return { svg: scheme.svg, version: `${scheme.scheme_id}-${scheme.published_at.getTime()}` };
}

async function activeSchemeOrFail(): Promise<ActiveSchemeSnapshot> {
  const scheme = await loadActiveScheme();
  if (!scheme) throw new UnavailableError("La búsqueda no está disponible: no hay ningún esquema activo");
  return scheme;
}

function describe(scheme: ActiveSchemeSnapshot, locationId: number, relation: SearchResult["relation"]): SearchResult {
  const path: PathStep[] = [];
  for (let id: number | null = locationId; id !== null; ) {
    const location: LocationRow = scheme.locations.get(id)!;
    path.unshift({
      location_id: location.location_id,
      code: location.code,
      name: location.name,
      level_name: location.level_name_override ?? location.level_name,
      position: location.sort_order,
      siblings: scheme.childCount.get(location.parent_location_id) ?? 1,
    });
    id = location.parent_location_id;
  }

  // La figura dibujada más profunda de la ruta.
  let highlightIndex = path.length - 1;
  while (highlightIndex >= 0 && !scheme.drawn.has(path[highlightIndex].code)) highlightIndex--;
  const found = scheme.locations.get(locationId)!;
  return {
    relation,
    range: { start: found.range_start_raw!, end: found.range_end_raw! },
    path,
    highlight_code: highlightIndex === -1 ? null : path[highlightIndex].code,
    below_highlight: highlightIndex === -1 ? path : path.slice(highlightIndex + 1),
  };
}
