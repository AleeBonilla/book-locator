import type { LocationRow } from "./queries.js";

// Ubicación tal como la devuelve la API: anidada bajo su padre.
export interface LocationNode {
  location_id: number;
  parent_location_id: number | null;
  code: string;
  name: string;
  level: number;
  level_name: string;
  level_name_override: string | null;
  // Nombre del nivel que se muestra: el propio de la ubicación, si lo tiene.
  display_level_name: string;
  sort_order: number;
  range_required: boolean;
  range: { start: string; end: string } | null;
  children: LocationNode[];
}

export function toNode(row: LocationRow): LocationNode {
  return {
    location_id: row.location_id,
    parent_location_id: row.parent_location_id,
    code: row.code,
    name: row.name,
    level: row.level,
    level_name: row.level_name,
    level_name_override: row.level_name_override,
    display_level_name: row.level_name_override ?? row.level_name,
    sort_order: row.sort_order,
    range_required: row.range_required,
    range:
      row.range_start_raw !== null && row.range_end_raw !== null
        ? { start: row.range_start_raw, end: row.range_end_raw }
        : null,
    children: [],
  };
}

// Arma el árbol a partir de filas ordenadas de modo que cada padre aparece
// antes que sus hijos (listLocations ordena por level y sort_order).
export function buildTree(rows: LocationRow[]): LocationNode[] {
  const nodes = new Map<number, LocationNode>();
  const roots: LocationNode[] = [];
  for (const row of rows) {
    const node = toNode(row);
    nodes.set(node.location_id, node);
    const parent = row.parent_location_id === null ? undefined : nodes.get(row.parent_location_id);
    (parent?.children ?? roots).push(node);
  }
  return roots;
}
