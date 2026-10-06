import type { Queryable } from "../db.js";

export interface ActiveSchemeRow {
  scheme_id: number;
  name: string;
  published_at: Date;
}

export async function findActiveScheme(db: Queryable): Promise<ActiveSchemeRow | null> {
  const { rows } = await db.query<ActiveSchemeRow>(
    "SELECT scheme_id, name, published_at FROM schemes WHERE is_active",
  );
  return rows[0] ?? null;
}

// Ubicaciones donde se busca: las más profundas con rango, es decir, las que
// tienen rango y ninguno de sus hijos lo tiene (decisión 0001 §2).
const CANDIDATES = `
  WITH candidates AS (
    SELECT l.location_id, l.range_start_key, l.range_end_key
      FROM locations l
     WHERE l.scheme_id = $1
       AND l.range_start_key IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM locations c
          WHERE c.scheme_id = l.scheme_id
            AND c.parent_location_id = l.location_id
            AND c.range_start_key IS NOT NULL
       )
  )`;

export interface RangeMatches {
  // Ubicaciones cuyo rango contiene el código; puede haber varias si los
  // rangos se solapan.
  containing: number[];
  // Si ninguna lo contiene: la que termina justo antes y la que empieza justo
  // después (cualquiera puede faltar si el código queda en un extremo).
  before: number | null;
  after: number | null;
}

// Todas las comparaciones las hace PostgreSQL entre claves BYTEA
// (docs/sort-key.md): `key` es la clave del código buscado.
export async function findRangeMatches(db: Queryable, schemeId: number, key: Buffer): Promise<RangeMatches> {
  const { rows } = await db.query<{ location_id: number }>(
    `${CANDIDATES}
     SELECT location_id FROM candidates
      WHERE range_start_key <= $2 AND $2 <= range_end_key`,
    [schemeId, key],
  );
  if (rows.length > 0) {
    return { containing: rows.map((row) => row.location_id), before: null, after: null };
  }

  const { rows: neighbors } = await db.query<{ side: "before" | "after"; location_id: number }>(
    `${CANDIDATES}
     (SELECT 'before' AS side, location_id FROM candidates
       WHERE range_end_key < $2
       ORDER BY range_end_key DESC, location_id
       LIMIT 1)
     UNION ALL
     (SELECT 'after' AS side, location_id FROM candidates
       WHERE range_start_key > $2
       ORDER BY range_start_key, location_id
       LIMIT 1)`,
    [schemeId, key],
  );
  const side = (name: string) => neighbors.find((row) => row.side === name)?.location_id ?? null;
  return { containing: [], before: side("before"), after: side("after") };
}
