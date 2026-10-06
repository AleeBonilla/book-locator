import { pool } from "../db.js";
import { listLocations, type LocationRow } from "../locations/queries.js";
import { inspectSvg } from "../maps/inspect-svg.js";
import { getMapSvg } from "../schemes/queries.js";
import { findActiveScheme } from "./queries.js";

// Copia en memoria del esquema activo: árbol de ubicaciones, plano y códigos
// dibujados. El esquema activo siempre está publicado, y un esquema publicado
// no cambia (decisión 0003 §4); para modificarlo hay que despublicarlo, lo que
// exige que deje de ser el activo. Por eso basta con recargar la copia cuando
// cambia el esquema activo o su fecha de publicación.
export interface ActiveSchemeSnapshot {
  scheme_id: number;
  name: string;
  published_at: Date;
  locations: Map<number, LocationRow>;
  // Cantidad de hijos de cada ubicación (null: raíces), para describir
  // posiciones como «3.º de 5».
  childCount: Map<number | null, number>;
  // Códigos con figura en el plano.
  drawn: Set<string>;
  svg: string;
}

let cached: ActiveSchemeSnapshot | null = null;

// Devuelve la copia vigente del esquema activo, o null si no hay ninguno.
export async function loadActiveScheme(): Promise<ActiveSchemeSnapshot | null> {
  const active = await findActiveScheme(pool);
  if (!active) return null;
  if (
    cached?.scheme_id === active.scheme_id &&
    cached.published_at.getTime() === active.published_at.getTime()
  ) {
    return cached;
  }

  const [rows, svg] = await Promise.all([listLocations(pool, active.scheme_id), getMapSvg(pool, active.scheme_id)]);
  const childCount = new Map<number | null, number>();
  for (const row of rows) {
    childCount.set(row.parent_location_id, (childCount.get(row.parent_location_id) ?? 0) + 1);
  }
  // Un esquema publicado siempre tiene plano (schemes_published_has_map).
  const map = svg ?? "";
  cached = {
    ...active,
    locations: new Map(rows.map((row) => [row.location_id, row])),
    childCount,
    drawn: new Set(inspectSvg(map).labels.map((label) => label.code)),
    svg: map,
  };
  return cached;
}
