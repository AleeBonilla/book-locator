import { pool, withTransaction, type Queryable } from "../db.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { listLocations, schemeHasRanges, type LocationRow } from "../locations/queries.js";
import { buildTree, type LocationNode } from "../locations/tree.js";
import { analyzeAssignment, type AssignmentReport } from "./assignment.js";
import * as queries from "./queries.js";
import type { SchemeRow } from "./queries.js";

export interface SchemeDetail extends SchemeRow {
  assignment: Omit<AssignmentReport, "status">;
  locations: LocationNode[];
}

export function listSchemes(): Promise<SchemeRow[]> {
  return queries.listSchemes(pool);
}

export function createScheme(
  input: { name: string; short_description?: string | null },
  userId: number,
): Promise<SchemeRow> {
  return queries.insertScheme(pool, {
    name: input.name,
    short_description: input.short_description ?? null,
    created_by: userId,
  });
}

export async function getScheme(schemeId: number): Promise<SchemeDetail> {
  const scheme = await queries.findScheme(pool, schemeId);
  if (!scheme) throw schemeNotFound(schemeId);
  const locations = await listLocations(pool, schemeId);
  const { status: _status, ...assignment } = analyzeAssignment(locations.map(toAssignmentLocation));
  return { ...scheme, assignment, locations: buildTree(locations) };
}

export function updateScheme(
  schemeId: number,
  changes: { name?: string; short_description?: string | null },
): Promise<SchemeRow> {
  return withTransaction(async (client) => {
    await lockEditableScheme(client, schemeId);
    return queries.updateScheme(client, schemeId, changes);
  });
}

// Bloquea el esquema hasta el final de la transacción y comprueba que se
// pueda modificar:
// - un esquema publicado no admite cambios (decisión 0003 §4);
// - con `structural`, tampoco se admiten si alguna ubicación tiene rango,
//   porque los rangos siguen el orden físico del árbol (decisión 0001 §4).
export async function lockEditableScheme(
  client: Queryable,
  schemeId: number,
  options: { structural?: boolean } = {},
): Promise<SchemeRow> {
  const scheme = await queries.lockScheme(client, schemeId);
  if (!scheme) throw schemeNotFound(schemeId);
  if (scheme.published_at !== null) {
    throw new ConflictError(
      "El esquema está publicado y no admite cambios: hay que despublicarlo o trabajar sobre una copia",
    );
  }
  if (options.structural && (await schemeHasRanges(client, schemeId))) {
    throw new ConflictError(
      "La estructura no se puede modificar mientras alguna ubicación tenga rango asignado",
    );
  }
  return scheme;
}

// Recalcula el estado del esquema a partir de sus ubicaciones y lo guarda si
// cambió. Se llama dentro de la transacción de cada operación que crea,
// elimina o marca ubicaciones (y, más adelante, que asigna rangos).
export async function refreshSchemeStatus(client: Queryable, scheme: SchemeRow): Promise<AssignmentReport> {
  const locations = await listLocations(client, scheme.scheme_id);
  const report = analyzeAssignment(locations.map(toAssignmentLocation));
  if (report.status !== scheme.status) {
    await queries.setSchemeStatus(client, scheme.scheme_id, report.status);
  }
  return report;
}

function toAssignmentLocation(location: LocationRow) {
  return {
    location_id: location.location_id,
    parent_location_id: location.parent_location_id,
    code: location.code,
    range_required: location.range_required,
    has_range: location.range_start_raw !== null,
  };
}

export function schemeNotFound(schemeId: number): NotFoundError {
  return new NotFoundError(`No existe el esquema ${schemeId}`);
}
