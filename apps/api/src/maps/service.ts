import { pool, withTransaction, type Queryable } from "../db.js";
import { InvalidInputError, NotFoundError } from "../errors.js";
import { compareCodes } from "../locations/codes.js";
import { listLocations } from "../locations/queries.js";
import { getMapSvg, setMapSvg, findScheme } from "../schemes/queries.js";
import { lockEditableScheme, schemeNotFound } from "../schemes/service.js";
import { inspectSvg } from "./inspect-svg.js";
import { buildMapReport, type MapReport } from "./report.js";

// Valida un plano frente al esquema sin guardarlo, para que el diseñador
// compruebe su archivo antes de subirlo.
export async function validateMap(schemeId: number, svg: string): Promise<MapReport> {
  if (!(await findScheme(pool, schemeId))) throw schemeNotFound(schemeId);
  return reportFor(pool, schemeId, svg);
}

// Guarda el plano si su contenido es aceptable. Los problemas de etiquetas
// (códigos inexistentes, ubicaciones obligatorias sin dibujar) no impiden
// guardarlo, porque se pueden corregir en el árbol o en un plano nuevo; sí
// impedirán publicar. Se informan en el reporte.
export function uploadMap(schemeId: number, svg: string): Promise<MapReport> {
  return withTransaction(async (client) => {
    await lockEditableScheme(client, schemeId);
    const report = await reportFor(client, schemeId, svg);
    if (!report.valid) {
      throw new InvalidInputError("El plano contiene elementos no permitidos o no es un SVG válido", report);
    }
    await setMapSvg(client, schemeId, svg);
    return report;
  });
}

export async function getMap(schemeId: number): Promise<string> {
  if (!(await findScheme(pool, schemeId))) throw schemeNotFound(schemeId);
  const svg = await getMapSvg(pool, schemeId);
  if (svg === null) throw new NotFoundError(`El esquema ${schemeId} no tiene plano`);
  return svg;
}

// Reporte del plano guardado frente al árbol actual: cambia si después de
// subir el plano se modificó la estructura o las marcas del mínimo.
export async function getMapReport(schemeId: number): Promise<MapReport> {
  return reportFor(pool, schemeId, await getMap(schemeId));
}

export function deleteMap(schemeId: number): Promise<void> {
  return withTransaction(async (client) => {
    await lockEditableScheme(client, schemeId);
    await setMapSvg(client, schemeId, null);
  });
}

export interface CodeSheetRow {
  code: string;
  // Nombre exacto que debe tener la figura en la herramienta de diseño.
  label: string;
  name: string;
  path: string;
  // La ubicación forma parte del mínimo de asignación: debe estar dibujada.
  required: boolean;
}

// Hoja de códigos para quien diseña el plano (guia-mapas.md §3), en el
// orden del árbol.
export async function getCodeSheet(schemeId: number): Promise<CodeSheetRow[]> {
  if (!(await findScheme(pool, schemeId))) throw schemeNotFound(schemeId);
  const locations = await listLocations(pool, schemeId);
  const byId = new Map(locations.map((location) => [location.location_id, location]));

  const pathOf = (locationId: number): string[] => {
    const location = byId.get(locationId)!;
    const parentPath = location.parent_location_id === null ? [] : pathOf(location.parent_location_id);
    return [...parentPath, location.name];
  };

  return locations
    .map((location) => ({
      code: location.code,
      label: `loc-${location.code}`,
      name: location.name,
      path: pathOf(location.location_id).join(" › "),
      required: location.range_required,
    }))
    // listLocations ordena por nivel; la hoja se lee mejor en orden de árbol.
    .sort((a, b) => compareCodes(a.code, b.code));
}

async function reportFor(db: Queryable, schemeId: number, svg: string): Promise<MapReport> {
  return buildMapReport(inspectSvg(svg), await listLocations(db, schemeId));
}
