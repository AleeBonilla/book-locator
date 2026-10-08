// API de administración (docs/api.md). Todas las rutas requieren sesión: si
// vence, http.ts avisa y el panel vuelve al inicio de sesión.
import { normalizeClassification } from '@bjff/classification';
import { ApiError } from './api-types.ts';
import type { LocationNode, MapReport, SchemeDetail, SchemeRow } from './admin-types.ts';
import { request, requestText } from './http.ts';
import type { NewLocation, Rename } from './structure.ts';

// Cambio en una ubicación: nombre, nivel o marca del mínimo.
export type LocationChange = Rename & { range_required?: boolean };

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

export function listSchemes(): Promise<SchemeRow[]> {
  return request<SchemeRow[]>('GET', '/schemes');
}

export function getScheme(schemeId: number): Promise<SchemeDetail> {
  return request<SchemeDetail>('GET', `/schemes/${schemeId}`);
}

export function createScheme(name: string): Promise<SchemeRow> {
  return request<SchemeRow>('POST', '/schemes', { name });
}

export function publishScheme(schemeId: number): Promise<SchemeRow> {
  return request<SchemeRow>('POST', `/schemes/${schemeId}/publish`);
}

export function unpublishScheme(schemeId: number): Promise<SchemeRow> {
  return request<SchemeRow>('POST', `/schemes/${schemeId}/unpublish`);
}

export function activateScheme(schemeId: number): Promise<SchemeRow> {
  return request<SchemeRow>('POST', `/schemes/${schemeId}/activate`);
}

// La copia nace sin publicar, con estructura, rangos y plano.
export function copyScheme(schemeId: number): Promise<SchemeRow> {
  return request<SchemeRow>('POST', `/schemes/${schemeId}/copy`, {});
}

// Deja como mínimo para publicar todas las ubicaciones de un nivel y solo
// esas ('' desmarca todas). Se envían solo las que cambian.
export async function setMinimumLevel(schemeId: number, levelName: string, locations: LocationNode[]): Promise<void> {
  const changes: LocationChange[] = [];
  const walk = (nodes: LocationNode[]) =>
    nodes.forEach((node) => {
      const required = node.level_name === levelName;
      if (node.range_required !== required) changes.push({ location_id: node.location_id, range_required: required });
      walk(node.children);
    });
  walk(locations);
  await updateLocations(schemeId, changes);
}

// ---------------------------------------------------------------------------
// Ubicaciones
// ---------------------------------------------------------------------------

// Crea varias ubicaciones, con su contenido, al final de las hijas de
// `parentId` (POST /schemes/:id/locations/batch, en una transacción).
export async function createLocations(schemeId: number, parentId: number | null, items: NewLocation[]): Promise<void> {
  await request('POST', `/schemes/${schemeId}/locations/batch`, { parent_location_id: parentId, locations: items });
}

// Cambia nombre, nivel o marca del mínimo de varias ubicaciones a la vez
// (PATCH /schemes/:id/locations, en una transacción).
export async function updateLocations(
  schemeId: number,
  changes: LocationChange[],
): Promise<void> {
  if (changes.length > 0) await request('PATCH', `/schemes/${schemeId}/locations`, { changes });
}

export async function updateLocation(
  locationId: number,
  changes: { name?: string; level_name?: string; range_required?: boolean },
): Promise<void> {
  await request('PATCH', `/locations/${locationId}`, changes);
}

// Sube o baja una posición entre sus hermanas.
export async function moveLocation(node: LocationNode, direction: -1 | 1): Promise<void> {
  await request('POST', `/locations/${node.location_id}/move`, {
    parent_location_id: node.parent_location_id,
    position: node.sort_order + direction,
  });
}

export async function deleteLocation(locationId: number): Promise<void> {
  await request('DELETE', `/locations/${locationId}`);
}

// ---------------------------------------------------------------------------
// Rangos
// ---------------------------------------------------------------------------

// Motivo por el que un código es inválido, o null. Se valida en el navegador
// con el mismo paquete que usa la API, para avisar al salir del campo.
export function validateCode(code: string): string | null {
  const result = normalizeClassification(code);
  return result.status === 'invalid' ? result.reason : null;
}

export async function setRange(locationId: number, start: string, end: string): Promise<void> {
  await request('PUT', `/locations/${locationId}/range`, { start, end });
}

export async function clearRange(locationId: number): Promise<void> {
  await request('DELETE', `/locations/${locationId}/range`);
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

// El plano guardado, o null si el esquema no tiene.
export async function getMap(schemeId: number): Promise<string | null> {
  return requestText('GET', `/schemes/${schemeId}/map`).catch(nullIfNotFound);
}

// Reporte del plano guardado frente al árbol actual, o null si no hay plano.
export async function getMapReport(schemeId: number): Promise<MapReport | null> {
  return request<MapReport>('GET', `/schemes/${schemeId}/map/report`).catch(nullIfNotFound);
}

// Con `save`, guarda el plano (422 con el reporte si su contenido no es
// aceptable); sin él, solo lo valida y devuelve el reporte.
export function uploadMap(schemeId: number, svg: string, save: boolean): Promise<MapReport> {
  const body = { raw: svg, contentType: 'image/svg+xml' };
  return save
    ? request<MapReport>('PUT', `/schemes/${schemeId}/map`, body)
    : request<MapReport>('POST', `/schemes/${schemeId}/map/validate`, body);
}

// Hoja de códigos para quien diseña el plano (con BOM, para Excel).
export function codeSheetCsv(schemeId: number): Promise<string> {
  return requestText('GET', `/schemes/${schemeId}/codes?format=csv`);
}

function nullIfNotFound(error: unknown): null {
  if (error instanceof ApiError && error.status === 404) return null;
  throw error;
}
