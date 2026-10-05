import { normalizeClassification } from "../classification/normalize.js";
import { classificationSortKey } from "../classification/sort-key.js";
import { pool, withTransaction, type Queryable } from "../db.js";
import { ConflictError, InvalidInputError } from "../errors.js";
import type { ValidationIssue } from "../http/validate.js";
import { lockEditableScheme, refreshSchemeStatus } from "../schemes/service.js";
import * as queries from "./queries.js";
import type { LocationRow, StoredRange } from "./queries.js";
import { mustFind } from "./service.js";
import { toNode, type LocationNode } from "./tree.js";

// Rangos de ubicaciones (decisión 0005). El texto se guarda tal como se
// escribió; la clave BYTEA de cada extremo es la que compara la base.

export function setLocationRange(
  locationId: number,
  input: { start: string; end: string },
  userId: number,
): Promise<LocationNode> {
  return withLockedLocation(locationId, async (client, location) => {
    const range = buildRange(input.start, input.end);
    await rejectIfDerived(client, location);
    await queries.setRange(client, locationId, range, userId);
    await syncAncestors(client, location, userId);
  });
}

export function clearLocationRange(locationId: number, userId: number): Promise<LocationNode> {
  return withLockedLocation(locationId, async (client, location) => {
    if (location.range_start_raw === null) return; // ya no tenía rango
    await rejectIfDerived(client, location);
    await queries.setRange(client, locationId, null, userId);
    await syncAncestors(client, location, userId);
  });
}

// Bloquea el esquema de la ubicación, ejecuta `work`, recalcula el estado del
// esquema y devuelve la ubicación actualizada, todo en una transacción. Los
// rangos se pueden cambiar aunque haya otros (no es un cambio de estructura),
// pero no en un esquema publicado.
async function withLockedLocation(
  locationId: number,
  work: (client: Queryable, location: LocationRow) => Promise<void>,
): Promise<LocationNode> {
  const { scheme_id } = await mustFind(pool, locationId);
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, scheme_id);
    await work(client, await mustFind(client, locationId));
    await refreshSchemeStatus(client, scheme);
    return toNode(await mustFind(client, locationId));
  });
}

// Normaliza los dos extremos y calcula sus claves. Si alguno es inválido,
// informa el motivo de cada uno (normalization.md §5).
function buildRange(start: string, end: string): StoredRange {
  const normalized = { start: normalizeClassification(start), end: normalizeClassification(end) };
  const issues: ValidationIssue[] = [];
  for (const field of ["start", "end"] as const) {
    const result = normalized[field];
    if (result.status === "invalid") issues.push({ path: field, message: result.reason });
  }
  if (normalized.start.status === "invalid" || normalized.end.status === "invalid") {
    throw new InvalidInputError("Código de clasificación inválido", issues);
  }

  const range = {
    start_raw: start,
    end_raw: end,
    start_key: classificationSortKey(normalized.start.code),
    end_key: classificationSortKey(normalized.end.code),
  };
  if (Buffer.compare(range.start_key, range.end_key) > 0) {
    throw new InvalidInputError(`El inicio del rango (${start}) va después de su fin (${end})`);
  }
  return range;
}

// Si todos los hijos de la ubicación tienen rango, el suyo se calcula a partir
// de ellos y no se puede cargar ni borrar a mano.
async function rejectIfDerived(client: Queryable, location: LocationRow): Promise<void> {
  const children = await queries.childRanges(client, location.location_id);
  if (children.length > 0 && children.every((child) => child.range !== null)) {
    throw new ConflictError(
      `El rango de ${location.code} se calcula a partir de sus ${children.length} hijos: hay que cambiar el de alguno de ellos`,
    );
  }
}

// Después de cambiar el rango de `changed`, recorre sus ancestros:
// - si todos los hijos de un ancestro tienen rango, el ancestro recibe el
//   inicio del primero y el fin del último (según sort_order);
// - si el único hijo sin rango es el que acaba de perderlo, el rango del
//   ancestro era calculado y deja de valer, así que se elimina.
// En cualquier otro caso, el ancestro no cambia y el recorrido termina.
async function syncAncestors(client: Queryable, changed: LocationRow, userId: number): Promise<void> {
  let child = changed;
  while (child.parent_location_id !== null) {
    const parent = await mustFind(client, child.parent_location_id);
    const children = await queries.childRanges(client, parent.location_id);
    const missing = children.filter((sibling) => sibling.range === null);

    if (missing.length === 0) {
      const first = children[0].range!;
      const last = children[children.length - 1].range!;
      if (Buffer.compare(first.start_key, last.end_key) > 0) {
        throw new InvalidInputError(
          `El rango de ${parent.code} quedaría invertido: su primer hijo empieza en ${first.start_raw}, ` +
            `después de donde termina el último (${last.end_raw})`,
        );
      }
      await queries.setRange(
        client,
        parent.location_id,
        { start_raw: first.start_raw, end_raw: last.end_raw, start_key: first.start_key, end_key: last.end_key },
        userId,
      );
    } else if (missing.length === 1 && missing[0].location_id === child.location_id && parent.range_start_raw !== null) {
      await queries.setRange(client, parent.location_id, null, userId);
    } else {
      return;
    }
    child = parent;
  }
}
