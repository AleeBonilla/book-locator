// API de administración simulada, en memoria, para revisar el diseño del
// panel sin backend. Reproduce las reglas del backend que se ven en pantalla:
// congelamiento de esquemas publicados, estructura fija con rangos (0001 §4),
// rangos calculados (0005), mínimo de asignación y requisitos para publicar
// (0003). Se reemplaza al conectar la API real.
import { compareClassifications } from '@classification/compare.ts';
import { normalizeClassification } from '@classification/normalize.ts';
import { analyzeAssignment } from '@api/schemes/assignment.ts';
import { ApiError } from './api-types.ts';
import type { LocationNode, MapReport, SchemeDetail, SchemeRow } from './admin-types.ts';
import { fetchMap } from './mock-api.ts';
import type { NewLocation, Rename } from './structure.ts';

interface StoredLocation {
  id: number;
  parentId: number | null;
  name: string;
  levelName: string;
  levelNameOverride: string | null;
  sortOrder: number;
  required: boolean;
  range: { start: string; end: string } | null;
  // Solo del simulador: el rango se calculó a partir de los hijos (0005).
  derived: boolean;
}

interface StoredScheme {
  id: number;
  name: string;
  description: string | null;
  publishedAt: string | null;
  isActive: boolean;
  updatedAt: string;
  map: string | null;
  locations: StoredLocation[];
}

const schemes: StoredScheme[] = [];
let nextLocationId = 1;
let nextSchemeId = 1;

const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Datos de ejemplo
// ---------------------------------------------------------------------------

// Rangos consecutivos para todos los anaqueles, en orden físico.
function centsToDdc(cents: number): string {
  const integer = String(Math.floor(cents / 100)).padStart(3, '0');
  const decimals = String(cents % 100).padStart(2, '0').replace(/0$/, '');
  return cents % 100 === 0 ? integer : `${integer}.${decimals}`;
}

function sampleRange(index: number, total: number) {
  const start = Math.floor((index * 100000) / total);
  const end = Math.floor(((index + 1) * 100000) / total) - 1;
  return { start: centsToDdc(start), end: `${centsToDdc(end)} Z99` };
}

function addLocation(scheme: StoredScheme, parentId: number | null, name: string, levelName: string): StoredLocation {
  const location: StoredLocation = {
    id: nextLocationId++,
    parentId,
    name,
    levelName,
    levelNameOverride: null,
    sortOrder: scheme.locations.filter((l) => l.parentId === parentId).length + 1,
    required: false,
    range: null,
    derived: false,
  };
  scheme.locations.push(location);
  return location;
}

// Fila › Cara › Mueble › Anaquel, como el plano de ejemplo: 10 filas, 2 caras,
// 16 muebles por cara (14 en la fila 4) y 5 anaqueles por mueble.
function buildSala(scheme: StoredScheme, skip: (code: string) => boolean) {
  const total = 10 * 2 * 16 * 5 - 2 * 2 * 5;
  let index = 0;
  for (let fila = 1; fila <= 10; fila++) {
    const f = addLocation(scheme, null, `Fila ${fila}`, 'Fila');
    for (let cara = 1; cara <= 2; cara++) {
      const c = addLocation(scheme, f.id, `Cara ${cara}`, 'Cara');
      for (let mueble = 1; mueble <= (fila === 4 ? 14 : 16); mueble++) {
        const m = addLocation(scheme, c.id, `Mueble ${mueble}`, 'Mueble');
        m.required = true;
        for (let anaquel = 1; anaquel <= 5; anaquel++) {
          const a = addLocation(scheme, m.id, `Anaquel ${anaquel}`, 'Anaquel');
          if (!skip(`${fila}-${cara}-${mueble}-${anaquel}`)) a.range = sampleRange(index, total);
          index++;
        }
      }
    }
  }
  deriveAll(scheme, null);
}

// Calcula de abajo hacia arriba los rangos de los padres cuyos hijos tienen
// todos rango.
function deriveAll(scheme: StoredScheme, parentId: number | null) {
  for (const location of childrenOf(scheme, parentId)) {
    deriveAll(scheme, location.id);
    const children = childrenOf(scheme, location.id);
    if (children.length > 0 && children.every((child) => child.range)) {
      location.range = { start: children[0].range!.start, end: children.at(-1)!.range!.end };
      location.derived = true;
    }
  }
}

let seeded: Promise<void> | null = null;

function seed(): Promise<void> {
  seeded ??= (async () => {
    const map = await fetchMap().catch(() => null);

    const general: StoredScheme = {
      id: nextSchemeId++,
      name: 'Sala general',
      description: 'Plano vigente de la colección general',
      publishedAt: '2026-10-05T15:20:00.000Z',
      isActive: true,
      updatedAt: '2026-10-05T15:20:00.000Z',
      map,
      locations: [],
    };
    buildSala(general, () => false);

    // Copia en preparación: faltan los rangos de cinco muebles y se eliminó un
    // mueble que el plano todavía dibuja.
    const copia: StoredScheme = {
      id: nextSchemeId++,
      name: 'Sala general (copia)',
      description: 'Reorganización de la fila 9',
      publishedAt: null,
      isActive: false,
      updatedAt: '2026-10-06T10:05:00.000Z',
      map,
      locations: [],
    };
    buildSala(copia, (code) => /^9-2-1[2-6]-/.test(code));
    const removed = copia.locations.find((l) => codeOf(copia, l) === '10-2-16')!;
    removeSubtree(copia, removed.id);

    const especiales: StoredScheme = {
      id: nextSchemeId++,
      name: 'Colecciones especiales',
      description: null,
      publishedAt: null,
      isActive: false,
      updatedAt: '2026-10-06T09:12:00.000Z',
      map: null,
      locations: [],
    };
    const fila = addLocation(especiales, null, 'Fila 1', 'Fila');
    const cara = addLocation(especiales, fila.id, 'Cara 1', 'Cara');
    for (let mueble = 1; mueble <= 4; mueble++) addLocation(especiales, cara.id, `Mueble ${mueble}`, 'Mueble');

    schemes.push(general, copia, especiales);
  })();
  return seeded;
}

// ---------------------------------------------------------------------------
// Árbol, códigos y estado
// ---------------------------------------------------------------------------

function childrenOf(scheme: StoredScheme, parentId: number | null): StoredLocation[] {
  return scheme.locations.filter((l) => l.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function codeOf(scheme: StoredScheme, location: StoredLocation): string {
  const parent = location.parentId === null ? null : scheme.locations.find((l) => l.id === location.parentId)!;
  return parent ? `${codeOf(scheme, parent)}-${location.sortOrder}` : String(location.sortOrder);
}

function toNodes(scheme: StoredScheme, parentId: number | null, prefix: string, level: number): LocationNode[] {
  return childrenOf(scheme, parentId).map((l) => {
    const code = prefix ? `${prefix}-${l.sortOrder}` : String(l.sortOrder);
    return {
      location_id: l.id,
      parent_location_id: l.parentId,
      code,
      name: l.name,
      level,
      level_name: l.levelName,
      level_name_override: l.levelNameOverride,
      display_level_name: l.levelNameOverride ?? l.levelName,
      sort_order: l.sortOrder,
      range_required: l.required,
      range: l.range,
      children: toNodes(scheme, l.id, code, level + 1),
    };
  });
}

function assignmentOf(scheme: StoredScheme) {
  return analyzeAssignment(
    scheme.locations.map((l) => ({
      location_id: l.id,
      parent_location_id: l.parentId,
      code: codeOf(scheme, l),
      range_required: l.required,
      has_range: l.range !== null,
    })),
  );
}

function toRow(scheme: StoredScheme): SchemeRow {
  return {
    scheme_id: scheme.id,
    name: scheme.name,
    status: assignmentOf(scheme).status,
    short_description: scheme.description,
    has_map: scheme.map !== null,
    is_active: scheme.isActive,
    published_at: scheme.publishedAt,
    updated_at: scheme.updatedAt,
  };
}

function schemeOrFail(schemeId: number): StoredScheme {
  const scheme = schemes.find((s) => s.id === schemeId);
  if (!scheme) throw new ApiError(404, `No existe el esquema ${schemeId}`);
  return scheme;
}

function locate(locationId: number): { scheme: StoredScheme; location: StoredLocation } {
  for (const scheme of schemes) {
    const location = scheme.locations.find((l) => l.id === locationId);
    if (location) return { scheme, location };
  }
  throw new ApiError(404, `No existe la ubicación ${locationId}`);
}

function assertEditable(scheme: StoredScheme, structural = false) {
  if (scheme.publishedAt) {
    throw new ApiError(409, 'El esquema está publicado y no admite cambios: hay que despublicarlo o trabajar sobre una copia');
  }
  if (structural && scheme.locations.some((l) => l.range)) {
    throw new ApiError(409, 'La estructura no se puede modificar mientras alguna ubicación tenga rango asignado');
  }
}

function touch(scheme: StoredScheme) {
  scheme.updatedAt = now();
}

function removeSubtree(scheme: StoredScheme, locationId: number) {
  const ids = new Set<number>([locationId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of scheme.locations) {
      if (l.parentId !== null && ids.has(l.parentId) && !ids.has(l.id)) {
        ids.add(l.id);
        grew = true;
      }
    }
  }
  const parentId = scheme.locations.find((l) => l.id === locationId)!.parentId;
  scheme.locations = scheme.locations.filter((l) => !ids.has(l.id));
  childrenOf(scheme, parentId).forEach((l, index) => (l.sortOrder = index + 1));
}

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

export async function listSchemes(): Promise<SchemeRow[]> {
  await seed();
  await wait();
  return schemes.map(toRow).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getScheme(schemeId: number): Promise<SchemeDetail> {
  await seed();
  await wait();
  const scheme = schemeOrFail(schemeId);
  const { status: _status, ...assignment } = assignmentOf(scheme);
  return { ...toRow(scheme), assignment, locations: toNodes(scheme, null, '', 1) };
}

export async function createScheme(name: string): Promise<SchemeRow> {
  await seed();
  await wait();
  const scheme: StoredScheme = {
    id: nextSchemeId++,
    name,
    description: null,
    publishedAt: null,
    isActive: false,
    updatedAt: now(),
    map: null,
    locations: [],
  };
  schemes.push(scheme);
  return toRow(scheme);
}

export async function publishScheme(schemeId: number): Promise<SchemeRow> {
  await wait();
  const scheme = schemeOrFail(schemeId);
  if (scheme.publishedAt) throw new ApiError(409, 'El esquema ya está publicado');
  if (assignmentOf(scheme).status !== 'ASSIGNED') throw new ApiError(409, 'El esquema no cumple el mínimo de asignación');
  if (!scheme.map) throw new ApiError(409, 'El esquema no tiene plano');
  if (!mapReportFor(scheme, scheme.map).publishable) throw new ApiError(409, 'El plano no cumple los requisitos para publicar');
  scheme.publishedAt = now();
  touch(scheme);
  return toRow(scheme);
}

export async function unpublishScheme(schemeId: number): Promise<SchemeRow> {
  await wait();
  const scheme = schemeOrFail(schemeId);
  if (scheme.isActive) throw new ApiError(409, 'Es el esquema activo: hay que activar otro antes de despublicarlo');
  scheme.publishedAt = null;
  touch(scheme);
  return toRow(scheme);
}

export async function activateScheme(schemeId: number): Promise<SchemeRow> {
  await wait();
  const scheme = schemeOrFail(schemeId);
  if (!scheme.publishedAt) throw new ApiError(409, 'Solo se puede activar un esquema publicado');
  for (const other of schemes) other.isActive = false;
  scheme.isActive = true;
  touch(scheme);
  return toRow(scheme);
}

export async function copyScheme(schemeId: number): Promise<SchemeRow> {
  await wait();
  const source = schemeOrFail(schemeId);
  const ids = new Map<number, number>();
  for (const l of source.locations) ids.set(l.id, nextLocationId++);
  const copy: StoredScheme = {
    ...source,
    id: nextSchemeId++,
    name: `Copia de ${source.name}`.slice(0, 80),
    publishedAt: null,
    isActive: false,
    updatedAt: now(),
    locations: source.locations.map((l) => ({
      ...l,
      id: ids.get(l.id)!,
      parentId: l.parentId === null ? null : ids.get(l.parentId)!,
    })),
  };
  schemes.push(copy);
  return toRow(copy);
}

// Marca como mínimo de asignación todas las ubicaciones de un nivel, y
// desmarca las demás.
export async function setMinimumLevel(schemeId: number, levelName: string): Promise<void> {
  await wait();
  const scheme = schemeOrFail(schemeId);
  assertEditable(scheme);
  for (const l of scheme.locations) l.required = l.levelName === levelName;
  touch(scheme);
}

// ---------------------------------------------------------------------------
// Ubicaciones
// ---------------------------------------------------------------------------

// Crea varias ubicaciones, con su contenido, al final de las hijas de
// `parentId`. Equivale a POST /schemes/:id/locations/batch (docs/api.md),
// en una sola transacción.
export async function createLocations(schemeId: number, parentId: number | null, items: NewLocation[]): Promise<void> {
  await wait(300);
  const scheme = schemeOrFail(schemeId);
  assertEditable(scheme, true);
  const add = (parent: number | null, list: NewLocation[]) => {
    for (const item of list) {
      const location = addLocation(scheme, parent, item.name, item.level_name);
      location.required = item.range_required;
      add(location.id, item.children);
    }
  };
  add(parentId, items);
  touch(scheme);
}

// Cambia el nombre o el nivel de varias ubicaciones a la vez. Equivale a
// PATCH /schemes/:id/locations (docs/api.md), en una sola transacción.
export async function updateLocations(schemeId: number, changes: Rename[]): Promise<void> {
  if (changes.length === 0) return;
  await wait();
  const scheme = schemeOrFail(schemeId);
  assertEditable(scheme);
  for (const change of changes) {
    const location = scheme.locations.find((l) => l.id === change.location_id);
    if (!location) throw new ApiError(422, `La ubicación ${change.location_id} no pertenece al esquema`);
    if (change.name !== undefined) location.name = change.name;
    if (change.level_name !== undefined) location.levelName = change.level_name;
  }
  touch(scheme);
}

export async function updateLocation(
  locationId: number,
  changes: { name?: string; level_name?: string; range_required?: boolean },
): Promise<void> {
  await wait();
  const { scheme, location } = locate(locationId);
  assertEditable(scheme);
  if (changes.name !== undefined) location.name = changes.name;
  if (changes.level_name !== undefined) location.levelName = changes.level_name;
  if (changes.range_required !== undefined) location.required = changes.range_required;
  touch(scheme);
}

export async function moveLocation(locationId: number, direction: -1 | 1): Promise<void> {
  await wait();
  const { scheme, location } = locate(locationId);
  assertEditable(scheme, true);
  const siblings = childrenOf(scheme, location.parentId);
  const other = siblings[siblings.indexOf(location) + direction];
  if (!other) return;
  [location.sortOrder, other.sortOrder] = [other.sortOrder, location.sortOrder];
  touch(scheme);
}

export async function deleteLocation(locationId: number): Promise<void> {
  await wait();
  const { scheme, location } = locate(locationId);
  assertEditable(scheme, true);
  removeSubtree(scheme, location.id);
  touch(scheme);
}

// ---------------------------------------------------------------------------
// Rangos (decisión 0005)
// ---------------------------------------------------------------------------

export function validateCode(code: string): string | null {
  const result = normalizeClassification(code);
  return result.status === 'invalid' ? result.reason : null;
}

export async function setRange(locationId: number, start: string, end: string): Promise<void> {
  await wait(120);
  const { scheme, location } = locate(locationId);
  assertEditable(scheme);
  const a = normalizeClassification(start);
  const b = normalizeClassification(end);
  const details = [
    ...(a.status === 'invalid' ? [{ path: 'start', message: a.reason }] : []),
    ...(b.status === 'invalid' ? [{ path: 'end', message: b.reason }] : []),
  ];
  if (a.status === 'invalid' || b.status === 'invalid') throw new ApiError(422, 'Código de clasificación inválido', details);
  if (compareClassifications(a.code, b.code) > 0) {
    throw new ApiError(422, `El inicio del rango (${start}) va después de su fin (${end})`);
  }
  rejectIfDerived(scheme, location);
  location.range = { start, end };
  location.derived = false;
  syncAncestors(scheme, location);
  touch(scheme);
}

export async function clearRange(locationId: number): Promise<void> {
  await wait(120);
  const { scheme, location } = locate(locationId);
  assertEditable(scheme);
  if (!location.range) return;
  rejectIfDerived(scheme, location);
  location.range = null;
  syncAncestors(scheme, location);
  touch(scheme);
}

function rejectIfDerived(scheme: StoredScheme, location: StoredLocation) {
  const children = childrenOf(scheme, location.id);
  if (children.length > 0 && children.every((child) => child.range)) {
    throw new ApiError(409, `El rango se calcula a partir de sus ${children.length} hijos: hay que cambiar el de alguno de ellos`);
  }
}

function syncAncestors(scheme: StoredScheme, changed: StoredLocation) {
  let child = changed;
  while (child.parentId !== null) {
    const parent = scheme.locations.find((l) => l.id === child.parentId)!;
    const children = childrenOf(scheme, parent.id);
    if (children.every((c) => c.range)) {
      parent.range = { start: children[0].range!.start, end: children.at(-1)!.range!.end };
      parent.derived = true;
    } else if (parent.derived) {
      parent.range = null;
      parent.derived = false;
    } else {
      return;
    }
    child = parent;
  }
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

export async function getMap(schemeId: number): Promise<string | null> {
  await seed();
  return schemeOrFail(schemeId).map;
}

export async function getMapReport(schemeId: number): Promise<MapReport | null> {
  await seed();
  const scheme = schemeOrFail(schemeId);
  return scheme.map ? mapReportFor(scheme, scheme.map) : null;
}

export async function uploadMap(schemeId: number, svg: string, save: boolean): Promise<MapReport> {
  await wait(300);
  const scheme = schemeOrFail(schemeId);
  if (save) assertEditable(scheme);
  const report = mapReportFor(scheme, svg);
  if (!report.valid) throw new ApiError(422, 'El plano contiene elementos no permitidos o no es un SVG válido', undefined, report);
  if (save) {
    scheme.map = svg;
    touch(scheme);
  }
  return report;
}

// Versión simplificada del reporte del backend (que valida con saxes y una
// lista blanca): aquí solo se leen las etiquetas.
function mapReportFor(scheme: StoredScheme, svg: string): MapReport {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const broken = doc.querySelector('parsererror');
  const ids = [...doc.querySelectorAll('[id^="loc-"]')].map((el) => el.id);
  const codes = scheme.locations.map((l) => ({ code: codeOf(scheme, l), name: l.name, required: l.required }));
  const known = new Set(codes.map((c) => c.code));
  const labels = ids.filter((id) => /^loc-[1-9]\d*(-[1-9]\d*)*$/.test(id)).map((id) => id.slice(4));
  const labeled = new Set(labels);
  const report: MapReport = {
    valid: !broken && doc.documentElement.localName === 'svg',
    issues: broken ? [{ line: 0, message: 'El archivo no es un XML válido' }] : [],
    labels: labels.length,
    unknown_codes: labels.filter((code) => !known.has(code)).map((code) => ({ code, line: 0 })),
    malformed_labels: ids.filter((id) => !/^loc-[1-9]\d*(-[1-9]\d*)*$/.test(id)).map((id) => ({ id, line: 0 })),
    duplicate_labels: [],
    missing_required: codes.filter((c) => c.required && !labeled.has(c.code)).map(({ code, name }) => ({ code, name })),
    publishable: false,
  };
  report.publishable =
    report.valid && report.unknown_codes.length === 0 && report.malformed_labels.length === 0 && report.missing_required.length === 0;
  return report;
}

// Hoja de códigos en el formato del backend (GET /schemes/:id/codes?format=csv).
export async function codeSheetCsv(schemeId: number): Promise<string> {
  await seed();
  const scheme = schemeOrFail(schemeId);
  const rows: string[] = ['codigo;etiqueta;nombre;ruta;obligatoria'];
  const walk = (nodes: LocationNode[], path: string[]) => {
    for (const node of nodes) {
      const route = [...path, node.name];
      rows.push([node.code, `loc-${node.code}`, node.name, route.join(' › '), node.range_required ? 'sí' : 'no'].join(';'));
      walk(node.children, route);
    }
  };
  walk(toNodes(scheme, null, '', 1), []);
  return '﻿' + rows.join('\r\n') + '\r\n';
}
