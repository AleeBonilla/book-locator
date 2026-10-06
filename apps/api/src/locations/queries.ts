import type { Queryable } from "../db.js";

export interface LocationRow {
  location_id: number;
  scheme_id: number;
  parent_location_id: number | null;
  level: number;
  level_name: string;
  level_name_override: string | null;
  name: string;
  code: string;
  sort_order: number;
  range_required: boolean;
  range_start_raw: string | null;
  range_end_raw: string | null;
  created_at: Date;
  updated_at: Date;
}

// Las claves BYTEA de los rangos (range_*_key) no se devuelven: solo las usa
// la base para comparar.
const LOCATION_COLUMNS = `
  location_id, scheme_id, parent_location_id, level, level_name, level_name_override,
  name, code, sort_order, range_required, range_start_raw, range_end_raw, created_at, updated_at`;

// Ubicaciones de un esquema, de modo que cada padre aparece antes que sus
// hijos y los hermanos quedan en orden.
export async function listLocations(db: Queryable, schemeId: number): Promise<LocationRow[]> {
  const { rows } = await db.query<LocationRow>(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE scheme_id = $1 ORDER BY level, sort_order`,
    [schemeId],
  );
  return rows;
}

export async function findLocation(db: Queryable, locationId: number): Promise<LocationRow | null> {
  const { rows } = await db.query<LocationRow>(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE location_id = $1`,
    [locationId],
  );
  return rows[0] ?? null;
}

export async function schemeHasRanges(db: Queryable, schemeId: number): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM locations WHERE scheme_id = $1 AND range_start_key IS NOT NULL) AS exists",
    [schemeId],
  );
  return rows[0].exists;
}

export async function countChildren(db: Queryable, schemeId: number, parentId: number | null): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM locations
      WHERE scheme_id = $1 AND parent_location_id IS NOT DISTINCT FROM $2`,
    [schemeId, parentId],
  );
  return rows[0].count;
}

// Identificadores de la ubicación y de todos sus descendientes.
export async function subtreeIds(db: Queryable, locationId: number): Promise<number[]> {
  const { rows } = await db.query<{ location_id: number }>(
    `WITH RECURSIVE subtree AS (
       SELECT location_id FROM locations WHERE location_id = $1
       UNION ALL
       SELECT l.location_id FROM locations l JOIN subtree s ON l.parent_location_id = s.location_id
     )
     SELECT location_id FROM subtree`,
    [locationId],
  );
  return rows.map((row) => row.location_id);
}

// Inserta la ubicación como último hijo de su padre (o última raíz). El código
// y el nivel se derivan del padre (decisión 0003 §1).
export async function insertLocation(
  db: Queryable,
  location: {
    scheme_id: number;
    parent: { location_id: number; level: number; code: string } | null;
    name: string;
    level_name: string;
    level_name_override: string | null;
    user_id: number;
  },
): Promise<LocationRow> {
  const sortOrder = (await countChildren(db, location.scheme_id, location.parent?.location_id ?? null)) + 1;
  const { rows } = await db.query<LocationRow>(
    `INSERT INTO locations (
       scheme_id, parent_location_id, level, level_name, level_name_override,
       name, code, sort_order, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     RETURNING ${LOCATION_COLUMNS}`,
    [
      location.scheme_id,
      location.parent?.location_id ?? null,
      (location.parent?.level ?? 0) + 1,
      location.level_name,
      location.level_name_override,
      location.name,
      location.parent ? `${location.parent.code}-${sortOrder}` : String(sortOrder),
      sortOrder,
      location.user_id,
    ],
  );
  return rows[0];
}

export async function updateLocation(
  db: Queryable,
  locationId: number,
  changes: {
    name?: string;
    level_name?: string;
    level_name_override?: string | null;
    range_required?: boolean;
  },
  userId: number,
): Promise<LocationRow> {
  const { rows } = await db.query<LocationRow>(
    `UPDATE locations
        SET name = COALESCE($2, name),
            level_name = COALESCE($3, level_name),
            level_name_override = CASE WHEN $4 THEN $5 ELSE level_name_override END,
            range_required = COALESCE($6, range_required),
            updated_by = $7,
            updated_at = now()
      WHERE location_id = $1
      RETURNING ${LOCATION_COLUMNS}`,
    [
      locationId,
      changes.name ?? null,
      changes.level_name ?? null,
      changes.level_name_override !== undefined,
      changes.level_name_override ?? null,
      changes.range_required ?? null,
      userId,
    ],
  );
  return rows[0];
}

// Marca o desmarca como mínimo de asignación todas las ubicaciones de un
// esquema con ese level_name. Devuelve cuántas cambiaron.
export async function setRangeRequiredByLevelName(
  db: Queryable,
  schemeId: number,
  levelName: string,
  required: boolean,
  userId: number,
): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE locations
        SET range_required = $3, updated_by = $4, updated_at = now()
      WHERE scheme_id = $1 AND level_name = $2 AND range_required <> $3`,
    [schemeId, levelName, required, userId],
  );
  return rowCount ?? 0;
}

// Elimina la ubicación y todos sus descendientes en una sola sentencia, de
// modo que la clave foránea al padre se comprueba con el subárbol ya borrado.
export async function deleteSubtree(db: Queryable, locationId: number): Promise<void> {
  await db.query(
    `WITH RECURSIVE subtree AS (
       SELECT location_id FROM locations WHERE location_id = $1
       UNION ALL
       SELECT l.location_id FROM locations l JOIN subtree s ON l.parent_location_id = s.location_id
     )
     DELETE FROM locations WHERE location_id IN (SELECT location_id FROM subtree)`,
    [locationId],
  );
}

// Recalcula sort_order, level y code de todas las ubicaciones de un esquema:
//
// - compacta las posiciones entre hermanos (1, 2, 3… sin huecos), p. ej.
//   después de eliminar una ubicación;
// - si se indica `move`, coloca esa ubicación bajo `parentId` en la posición
//   `position` (o al final, si es null) antes de compactar;
// - deriva level y code del padre (decisión 0003 §1).
//
// Todo ocurre en un único UPDATE porque los CHECK de locations se comprueban
// fila por fila: sort_order, level y code tienen que cambiar juntos. Las
// restricciones de unicidad (DEFERRABLE) y la clave foránea al padre se
// comprueban al terminar la sentencia, y el trigger locations_code_hierarchy
// al hacer COMMIT.
export async function renumberLocations(
  db: Queryable,
  schemeId: number,
  move?: { locationId: number; parentId: number | null; position: number | null },
): Promise<void> {
  await db.query(
    `WITH RECURSIVE
     placed AS (
       -- Padre de cada ubicación, ya con la ubicación movida en su destino.
       SELECT location_id,
              CASE WHEN location_id = $2 THEN $3::int ELSE parent_location_id END AS parent_id,
              location_id = $2 AS moved,
              sort_order
         FROM locations
        WHERE scheme_id = $1
     ),
     keyed AS (
       -- Las demás conservan su orden relativo (1, 2, 3…); la movida se
       -- intercala justo antes de la que ocupa su posición destino. Sin
       -- posición, la clave es NULL y queda al final.
       SELECT location_id, parent_id,
              CASE WHEN moved THEN $4::numeric - 0.5
                   ELSE row_number() OVER (PARTITION BY parent_id, moved ORDER BY sort_order)::numeric
              END AS sort_key
         FROM placed
     ),
     ordered AS (
       SELECT location_id, parent_id,
              row_number() OVER (PARTITION BY parent_id ORDER BY sort_key NULLS LAST) AS position
         FROM keyed
     ),
     tree AS (
       SELECT location_id, parent_id, position, 1 AS level, position::text AS code
         FROM ordered
        WHERE parent_id IS NULL
       UNION ALL
       SELECT o.location_id, o.parent_id, o.position, t.level + 1, t.code || '-' || o.position
         FROM ordered o
         JOIN tree t ON o.parent_id = t.location_id
     )
     UPDATE locations l
        SET parent_location_id = t.parent_id,
            sort_order = t.position,
            level = t.level,
            code = t.code
       FROM tree t
      WHERE l.location_id = t.location_id
        AND (l.parent_location_id, l.sort_order, l.level, l.code)
            IS DISTINCT FROM (t.parent_id, t.position, t.level, t.code)`,
    [schemeId, move?.locationId ?? null, move?.parentId ?? null, move?.position ?? null],
  );
}

export interface StoredRange {
  start_raw: string;
  end_raw: string;
  start_key: Buffer;
  end_key: Buffer;
}

export interface ChildRange {
  location_id: number;
  range: StoredRange | null;
}

// Hijos de una ubicación, en orden, con sus rangos y claves. Se usa para
// calcular el rango del padre a partir de los hijos (decisión 0005).
export async function childRanges(db: Queryable, parentId: number): Promise<ChildRange[]> {
  const { rows } = await db.query<{
    location_id: number;
    range_start_raw: string | null;
    range_end_raw: string | null;
    range_start_key: Buffer | null;
    range_end_key: Buffer | null;
  }>(
    `SELECT location_id, range_start_raw, range_end_raw, range_start_key, range_end_key
       FROM locations
      WHERE parent_location_id = $1
      ORDER BY sort_order`,
    [parentId],
  );
  return rows.map((row) => ({
    location_id: row.location_id,
    range:
      row.range_start_raw === null
        ? null
        : {
            start_raw: row.range_start_raw,
            end_raw: row.range_end_raw!,
            start_key: row.range_start_key!,
            end_key: row.range_end_key!,
          },
  }));
}

// Guarda el rango de una ubicación, o lo elimina con `range` null. Los cuatro
// campos cambian juntos (restricción locations_range_complete).
export async function setRange(
  db: Queryable,
  locationId: number,
  range: StoredRange | null,
  userId: number,
): Promise<void> {
  await db.query(
    `UPDATE locations
        SET range_start_raw = $2, range_end_raw = $3, range_start_key = $4, range_end_key = $5,
            updated_by = $6, updated_at = now()
      WHERE location_id = $1`,
    [
      locationId,
      range?.start_raw ?? null,
      range?.end_raw ?? null,
      range?.start_key ?? null,
      range?.end_key ?? null,
      userId,
    ],
  );
}

// Copia todas las ubicaciones de un esquema a otro, con sus códigos, marcas
// y rangos. Cada ubicación recibe un id nuevo y su padre se traduce al id
// nuevo del padre. Los códigos se conservan: son únicos por esquema, así que
// el plano copiado sigue sirviendo sin cambios (decisión 0003 §4).
//
// Es una sola sentencia: la clave foránea al padre se comprueba al terminar,
// con todas las filas ya insertadas, y el trigger de códigos al hacer COMMIT.
export async function copyLocations(db: Queryable, fromSchemeId: number, toSchemeId: number, userId: number): Promise<void> {
  await db.query(
    `WITH source AS MATERIALIZED (
       SELECT l.*, nextval(pg_get_serial_sequence('locations', 'location_id')) AS new_id
         FROM locations l
        WHERE l.scheme_id = $1
     )
     INSERT INTO locations (
       location_id, scheme_id, parent_location_id, level, level_name, level_name_override,
       name, code, sort_order, range_required,
       range_start_raw, range_end_raw, range_start_key, range_end_key,
       created_by, updated_by
     )
     SELECT s.new_id, $2, parent.new_id, s.level, s.level_name, s.level_name_override,
            s.name, s.code, s.sort_order, s.range_required,
            s.range_start_raw, s.range_end_raw, s.range_start_key, s.range_end_key,
            $3, $3
       FROM source s
       LEFT JOIN source parent ON parent.location_id = s.parent_location_id`,
    [fromSchemeId, toSchemeId, userId],
  );
}
