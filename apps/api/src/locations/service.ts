import { pool, withTransaction, type Queryable } from "../db.js";
import { InvalidInputError, NotFoundError } from "../errors.js";
import { lockEditableScheme, refreshSchemeStatus } from "../schemes/service.js";
import type { AssignmentReport } from "../schemes/assignment.js";
import * as queries from "./queries.js";
import type { LocationRow } from "./queries.js";
import { toNode, type LocationNode } from "./tree.js";

export interface CreateLocationInput {
  parent_location_id: number | null;
  name: string;
  level_name: string;
  level_name_override?: string | null;
  // Posición entre sus hermanos (1 = primera); sin ella, va al final.
  position?: number;
}

export interface UpdateLocationInput {
  name?: string;
  level_name?: string;
  level_name_override?: string | null;
  range_required?: boolean;
}

export interface MoveLocationInput {
  parent_location_id: number | null;
  position?: number;
}

export function createLocation(schemeId: number, input: CreateLocationInput, userId: number): Promise<LocationNode> {
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, schemeId, { structural: true });
    const parent = input.parent_location_id === null
      ? null
      : await findParent(client, schemeId, input.parent_location_id);

    let location = await queries.insertLocation(client, {
      scheme_id: schemeId,
      parent,
      name: input.name,
      level_name: input.level_name,
      level_name_override: input.level_name_override ?? null,
      user_id: userId,
    });

    if (input.position !== undefined && input.position !== location.sort_order) {
      checkPosition(input.position, location.sort_order);
      await queries.renumberLocations(client, schemeId, {
        locationId: location.location_id,
        parentId: location.parent_location_id,
        position: input.position,
      });
      location = await mustFind(client, location.location_id);
    }

    await refreshSchemeStatus(client, scheme);
    return toNode(location);
  });
}

// Cambios que no alteran la estructura: nombres y marca del mínimo de
// asignación. Se permiten aunque haya rangos (decisión 0001 §4).
export async function updateLocation(
  locationId: number,
  changes: UpdateLocationInput,
  userId: number,
): Promise<LocationNode> {
  const { scheme_id } = await mustFind(pool, locationId);
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, scheme_id);
    await mustFind(client, locationId); // pudo eliminarse mientras se esperaba el bloqueo
    const location = await queries.updateLocation(client, locationId, changes, userId);
    if (changes.range_required !== undefined) {
      await refreshSchemeStatus(client, scheme);
    }
    return toNode(location);
  });
}

// Mueve la ubicación (con todo su subárbol) bajo otro padre, o la cambia de
// posición entre sus hermanos. Los códigos del subárbol y de los hermanos
// afectados se recalculan.
export async function moveLocation(locationId: number, input: MoveLocationInput): Promise<LocationNode> {
  const { scheme_id } = await mustFind(pool, locationId);
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, scheme_id, { structural: true });
    const current = await mustFind(client, locationId);

    const parentId = input.parent_location_id;
    if (parentId !== null) {
      await findParent(client, scheme_id, parentId);
      if ((await queries.subtreeIds(client, locationId)).includes(parentId)) {
        throw new InvalidInputError("Una ubicación no puede moverse dentro de sí misma ni de sus descendientes");
      }
    }

    const siblings = await queries.countChildren(client, scheme_id, parentId);
    const otherSiblings = current.parent_location_id === parentId ? siblings - 1 : siblings;
    if (input.position !== undefined) checkPosition(input.position, otherSiblings + 1);

    await queries.renumberLocations(client, scheme_id, {
      locationId,
      parentId,
      position: input.position ?? null,
    });
    await refreshSchemeStatus(client, scheme);
    return toNode(await mustFind(client, locationId));
  });
}

// Elimina la ubicación con todo su subárbol y renumera a los hermanos que
// quedaban después, para no dejar huecos.
export async function deleteLocation(locationId: number): Promise<void> {
  const { scheme_id } = await mustFind(pool, locationId);
  await withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, scheme_id, { structural: true });
    await mustFind(client, locationId);
    await queries.deleteSubtree(client, locationId);
    await queries.renumberLocations(client, scheme_id);
    await refreshSchemeStatus(client, scheme);
  });
}

// Marca o desmarca de una vez todas las ubicaciones de un nivel
// («marcar todos los Mueble»). Se guarda la marca de cada ubicación.
export function setRangeRequiredByLevel(
  schemeId: number,
  input: { level_name: string; range_required: boolean },
  userId: number,
): Promise<{ updated: number; assignment: AssignmentReport }> {
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, schemeId);
    const updated = await queries.setRangeRequiredByLevelName(
      client,
      schemeId,
      input.level_name,
      input.range_required,
      userId,
    );
    const assignment = await refreshSchemeStatus(client, scheme);
    return { updated, assignment };
  });
}

async function mustFind(db: Queryable, locationId: number): Promise<LocationRow> {
  const location = await queries.findLocation(db, locationId);
  if (!location) throw new NotFoundError(`No existe la ubicación ${locationId}`);
  return location;
}

async function findParent(db: Queryable, schemeId: number, parentId: number): Promise<LocationRow> {
  const parent = await queries.findLocation(db, parentId);
  if (!parent || parent.scheme_id !== schemeId) {
    throw new InvalidInputError(`La ubicación ${parentId} no existe en el esquema ${schemeId}`);
  }
  return parent;
}

function checkPosition(position: number, max: number): void {
  if (position > max) {
    throw new InvalidInputError(`La posición ${position} no existe: la última posición disponible es ${max}`);
  }
}
