import { withTransaction, type Queryable } from "../db.js";
import { ConflictError } from "../errors.js";
import { copyLocations, listLocations } from "../locations/queries.js";
import { inspectSvg } from "../maps/inspect-svg.js";
import { buildMapReport } from "../maps/report.js";
import * as queries from "./queries.js";
import type { SchemeRow } from "./queries.js";
import { getScheme, refreshSchemeStatus, schemeNotFound, type SchemeDetail } from "./service.js";

// Publicación, activación y copia de esquemas (decisión 0003 §4).

// Publica el esquema si cumple el mínimo de asignación (ASSIGNED) y su plano
// dibuja todas las ubicaciones obligatorias sin etiquetas erróneas. Si no,
// responde 409 con el detalle de lo que falta.
export function publishScheme(schemeId: number, userId: number): Promise<SchemeRow> {
  return withTransaction(async (client) => {
    const scheme = await lockOrFail(client, schemeId);
    if (scheme.published_at !== null) throw new ConflictError("El esquema ya está publicado");

    // Se recalcula aquí para no depender de un estado guardado desactualizado.
    const assignment = await refreshSchemeStatus(client, scheme);
    if (assignment.status !== "ASSIGNED") {
      throw new ConflictError("El esquema no cumple el mínimo de asignación", { assignment });
    }

    const svg = await queries.getMapSvg(client, schemeId);
    if (svg === null) throw new ConflictError("El esquema no tiene plano");
    const map = buildMapReport(inspectSvg(svg), await listLocations(client, schemeId));
    if (!map.publishable) {
      throw new ConflictError("El plano no cumple los requisitos para publicar", { map });
    }

    await queries.setPublished(client, schemeId, userId);
    return (await queries.findScheme(client, schemeId))!;
  });
}

// Vuelve a permitir cambios. El esquema activo no se puede despublicar: la
// búsqueda pública nunca debe quedarse sin esquema.
export function unpublishScheme(schemeId: number): Promise<SchemeRow> {
  return withTransaction(async (client) => {
    const scheme = await lockOrFail(client, schemeId);
    if (scheme.published_at === null) throw new ConflictError("El esquema no está publicado");
    if (scheme.is_active) {
      throw new ConflictError("Es el esquema activo: hay que activar otro antes de despublicarlo");
    }
    await queries.setPublished(client, schemeId, null);
    return (await queries.findScheme(client, schemeId))!;
  });
}

// Convierte el esquema en el que usa la búsqueda pública y desactiva el
// anterior, en la misma transacción.
export function activateScheme(schemeId: number): Promise<SchemeRow> {
  return withTransaction(async (client) => {
    await queries.lockForActivation(client, schemeId);
    const scheme = await queries.findScheme(client, schemeId);
    if (!scheme) throw schemeNotFound(schemeId);
    if (scheme.published_at === null) throw new ConflictError("Solo se puede activar un esquema publicado");
    if (!scheme.enabled) throw new ConflictError("El esquema está deshabilitado");
    await queries.activateScheme(client, schemeId);
    return (await queries.findScheme(client, schemeId))!;
  });
}

const MAX_NAME_LENGTH = 80;

// Copia el esquema con su estructura, códigos, marcas, rangos y plano. La
// copia nace sin publicar ni activar, así que se puede modificar; es la forma
// recomendada de cambiar un esquema publicado.
export async function copyScheme(sourceId: number, input: { name?: string }, userId: number): Promise<SchemeDetail> {
  const copyId = await withTransaction(async (client) => {
    const source = await lockOrFail(client, sourceId);
    const name = input.name ?? `Copia de ${source.name}`.slice(0, MAX_NAME_LENGTH);
    const id = await queries.insertSchemeCopy(client, sourceId, { name, created_by: userId });
    await copyLocations(client, sourceId, id, userId);
    await refreshSchemeStatus(client, (await queries.lockScheme(client, id))!);
    return id;
  });
  return getScheme(copyId);
}

async function lockOrFail(client: Queryable, schemeId: number): Promise<SchemeRow> {
  const scheme = await queries.lockScheme(client, schemeId);
  if (!scheme) throw schemeNotFound(schemeId);
  return scheme;
}
