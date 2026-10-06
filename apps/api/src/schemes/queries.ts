import type { Queryable } from "../db.js";
import type { SchemeStatus } from "./assignment.js";

export interface SchemeRow {
  scheme_id: number;
  name: string;
  status: SchemeStatus;
  short_description: string | null;
  has_map: boolean;
  is_active: boolean;
  enabled: boolean;
  created_by: number | null;
  published_by: number | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// map_svg puede pesar cientos de KB: no se lee al listar ni al consultar un
// esquema, solo se informa si existe.
const SCHEME_COLUMNS = `
  scheme_id, name, status, short_description, map_svg IS NOT NULL AS has_map,
  is_active, enabled, created_by, published_by, published_at, created_at, updated_at`;

export async function listSchemes(db: Queryable): Promise<SchemeRow[]> {
  const { rows } = await db.query<SchemeRow>(
    `SELECT ${SCHEME_COLUMNS} FROM schemes ORDER BY created_at DESC, scheme_id DESC`,
  );
  return rows;
}

export async function findScheme(db: Queryable, schemeId: number): Promise<SchemeRow | null> {
  const { rows } = await db.query<SchemeRow>(
    `SELECT ${SCHEME_COLUMNS} FROM schemes WHERE scheme_id = $1`,
    [schemeId],
  );
  return rows[0] ?? null;
}

// Igual que findScheme, pero bloquea la fila hasta el final de la
// transacción. Toda operación que modifica un esquema o sus ubicaciones lo
// hace primero: así dos peticiones simultáneas sobre el mismo esquema se
// ejecutan una después de la otra y no calculan, p. ej., el mismo sort_order.
export async function lockScheme(db: Queryable, schemeId: number): Promise<SchemeRow | null> {
  const { rows } = await db.query<SchemeRow>(
    `SELECT ${SCHEME_COLUMNS} FROM schemes WHERE scheme_id = $1 FOR UPDATE`,
    [schemeId],
  );
  return rows[0] ?? null;
}

export async function insertScheme(
  db: Queryable,
  scheme: { name: string; short_description: string | null; created_by: number },
): Promise<SchemeRow> {
  const { rows } = await db.query<SchemeRow>(
    `INSERT INTO schemes (name, short_description, created_by)
     VALUES ($1, $2, $3)
     RETURNING ${SCHEME_COLUMNS}`,
    [scheme.name, scheme.short_description, scheme.created_by],
  );
  return rows[0];
}

export async function updateScheme(
  db: Queryable,
  schemeId: number,
  changes: { name?: string; short_description?: string | null },
): Promise<SchemeRow> {
  // COALESCE no sirve para short_description, que puede volver a NULL: se
  // indica explícitamente si cada campo cambia.
  const { rows } = await db.query<SchemeRow>(
    `UPDATE schemes
        SET name = CASE WHEN $2 THEN $3 ELSE name END,
            short_description = CASE WHEN $4 THEN $5 ELSE short_description END,
            updated_at = now()
      WHERE scheme_id = $1
      RETURNING ${SCHEME_COLUMNS}`,
    [
      schemeId,
      changes.name !== undefined,
      changes.name ?? null,
      changes.short_description !== undefined,
      changes.short_description ?? null,
    ],
  );
  return rows[0];
}

export async function setSchemeStatus(db: Queryable, schemeId: number, status: SchemeStatus): Promise<void> {
  await db.query(
    "UPDATE schemes SET status = $2, updated_at = now() WHERE scheme_id = $1",
    [schemeId, status],
  );
}

export async function getMapSvg(db: Queryable, schemeId: number): Promise<string | null> {
  const { rows } = await db.query<{ map_svg: string | null }>(
    "SELECT map_svg FROM schemes WHERE scheme_id = $1",
    [schemeId],
  );
  return rows[0]?.map_svg ?? null;
}

// Guarda el plano, o lo elimina con `svg` null.
export async function setMapSvg(db: Queryable, schemeId: number, svg: string | null): Promise<void> {
  await db.query(
    "UPDATE schemes SET map_svg = $2, updated_at = now() WHERE scheme_id = $1",
    [schemeId, svg],
  );
}

// Publica (con el usuario que publica) o despublica (con null).
export async function setPublished(db: Queryable, schemeId: number, userId: number | null): Promise<void> {
  await db.query(
    `UPDATE schemes
        SET published_by = $2,
            published_at = CASE WHEN $2::int IS NULL THEN NULL ELSE now() END,
            updated_at = now()
      WHERE scheme_id = $1`,
    [schemeId, userId],
  );
}

// Bloquea el esquema indicado y el que esté activo, en orden de id para que
// dos activaciones simultáneas no se bloqueen mutuamente.
export async function lockForActivation(db: Queryable, schemeId: number): Promise<void> {
  await db.query(
    "SELECT scheme_id FROM schemes WHERE is_active OR scheme_id = $1 ORDER BY scheme_id FOR UPDATE",
    [schemeId],
  );
}

// Deja `schemeId` como único esquema activo. Primero desactiva el anterior:
// el índice schemes_single_active no admite dos activos ni por un instante.
export async function activateScheme(db: Queryable, schemeId: number): Promise<void> {
  await db.query(
    "UPDATE schemes SET is_active = false, updated_at = now() WHERE is_active AND scheme_id <> $1",
    [schemeId],
  );
  await db.query(
    "UPDATE schemes SET is_active = true, updated_at = now() WHERE scheme_id = $1 AND NOT is_active",
    [schemeId],
  );
}

// Crea un esquema nuevo con el nombre indicado y la descripción y el plano
// de `sourceId`. Nace sin publicar ni activar.
export async function insertSchemeCopy(
  db: Queryable,
  sourceId: number,
  copy: { name: string; created_by: number },
): Promise<number> {
  const { rows } = await db.query<{ scheme_id: number }>(
    `INSERT INTO schemes (name, short_description, map_svg, created_by)
     SELECT $2, short_description, map_svg, $3 FROM schemes WHERE scheme_id = $1
     RETURNING scheme_id`,
    [sourceId, copy.name, copy.created_by],
  );
  return rows[0].scheme_id;
}
