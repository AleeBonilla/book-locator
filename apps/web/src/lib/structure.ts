// Estructura de la sala: qué niveles hay, qué contiene cada uno y cuántas
// ubicaciones de cada nivel van en su lugar. Es un árbol, así que admite
// ramas de distinta profundidad (Fila › Cara › Mueble › Anaquel junto a
// Mesa de consulta › Anaquel). Solo existe en el panel: sirve para crear las
// ubicaciones de una vez y ponerles nombre. El backend guarda las ubicaciones
// con su nombre y su nivel, nada más.
import type { LocationNode } from './admin-types.ts';

export interface TemplateNode {
  // Identificador estable para React mientras se edita.
  key: number;
  name: string;
  // Cuántas van dentro de cada ubicación del nivel padre (o en la sala).
  count: number;
  children: TemplateNode[];
}

// Ubicación por crear, con lo que va dentro (cuerpo de createLocations).
export interface NewLocation {
  name: string;
  level_name: string;
  range_required: boolean;
  children: NewLocation[];
}

export interface Rename {
  location_id: number;
  name?: string;
  level_name?: string;
}

export const MAX_COUNT = 999;
export const MAX_TOTAL = 10000;

let nextKey = 1;

export function templateNode(name = '', count = 1, children: TemplateNode[] = []): TemplateNode {
  return { key: nextKey++, name, count, children };
}

export function cloneTemplate(nodes: TemplateNode[]): TemplateNode[] {
  return nodes.map((node) => templateNode(node.name, node.count, cloneTemplate(node.children)));
}

// ---------------------------------------------------------------------------
// Nombres automáticos
// ---------------------------------------------------------------------------

// Nombre que recibe una ubicación si no tiene uno propio: «Mueble 3».
export function autoName(levelName: string, position: number): string {
  return `${levelName} ${position}`;
}

// Posición entre las hermanas del mismo nivel: la primera mesa de consulta es
// la 1 aunque haya diez filas antes.
export function positionAmong(node: LocationNode, siblings: LocationNode[]): number {
  return siblings.filter((s) => s.level_name === node.level_name).findIndex((s) => s.location_id === node.location_id) + 1;
}

// Una ubicación tiene nombre propio si su nombre no es el automático.
export function hasOwnName(node: LocationNode, siblings: LocationNode[]): boolean {
  return node.name !== autoName(node.level_name, positionAmong(node, siblings));
}

// Renombra las hermanas con nombre automático según su nueva posición
// (después de reordenar o eliminar). Las de nombre propio no se tocan.
export function renumber(before: LocationNode[], after: LocationNode[]): Rename[] {
  return after.flatMap((node) => {
    const name = autoName(node.level_name, positionAmong(node, after));
    return !hasOwnName(node, before) && node.name !== name ? [{ location_id: node.location_id, name }] : [];
  });
}

// Cambia el nombre de un nivel en todas sus ubicaciones, y el de las que
// tienen nombre automático («Fila 3» → «Pasillo 3»).
export function renameLevel(roots: LocationNode[], from: string, to: string): Rename[] {
  const renames: Rename[] = [];
  const walk = (siblings: LocationNode[]) => {
    for (const node of siblings) {
      if (node.level_name === from) {
        renames.push({
          location_id: node.location_id,
          level_name: to,
          ...(hasOwnName(node, siblings) ? {} : { name: autoName(to, positionAmong(node, siblings)) }),
        });
      }
      walk(node.children);
    }
  };
  walk(roots);
  return renames;
}

export function levelNames(roots: LocationNode[]): string[] {
  const names = new Set<string>();
  const walk = (nodes: LocationNode[]) =>
    nodes.forEach((node) => {
      names.add(node.level_name);
      walk(node.children);
    });
  walk(roots);
  return [...names];
}

// ---------------------------------------------------------------------------
// Crear ubicaciones a partir de la estructura
// ---------------------------------------------------------------------------

// Total de ubicaciones que crea la estructura.
export function countTemplate(nodes: TemplateNode[]): number {
  return nodes.reduce((total, node) => total + node.count * (1 + countTemplate(node.children)), 0);
}

// Primer problema de la estructura, o null si se puede crear.
export function templateProblem(nodes: TemplateNode[]): string | null {
  if (nodes.length === 0) return 'Agregue al menos un nivel.';
  const check = (list: TemplateNode[]): string | null => {
    const names = list.map((node) => node.name.trim());
    if (names.some((name) => !name)) return 'Cada nivel necesita un nombre.';
    const repeated = names.find((name, index) => names.indexOf(name) !== index);
    if (repeated) return `«${repeated}» está dos veces en el mismo lugar.`;
    if (list.some((node) => !Number.isInteger(node.count) || node.count < 1 || node.count > MAX_COUNT)) {
      return `Las cantidades van de 1 a ${MAX_COUNT}.`;
    }
    for (const node of list) {
      const problem = check(node.children);
      if (problem) return problem;
    }
    return null;
  };
  const problem = check(nodes);
  if (problem) return problem;
  const total = countTemplate(nodes);
  return total > MAX_TOTAL
    ? `Serían ${total.toLocaleString('es-CR')} ubicaciones; el máximo de una vez es ${MAX_TOTAL.toLocaleString('es-CR')}.`
    : null;
}

// Ubicaciones por crear según la estructura, marcadas como mínimo si su nivel
// está en `required`. Se numeran después de las hermanas que ya existen.
export function buildLocations(nodes: TemplateNode[], required: ReadonlySet<string>, existing: LocationNode[] = []): NewLocation[] {
  const counters = new Map<string, number>();
  for (const sibling of existing) counters.set(sibling.level_name, (counters.get(sibling.level_name) ?? 0) + 1);
  return nodes.flatMap((node) => {
    const name = node.name.trim();
    return Array.from({ length: node.count }, () => {
      const position = (counters.get(name) ?? 0) + 1;
      counters.set(name, position);
      return {
        name: autoName(name, position),
        level_name: name,
        range_required: required.has(name),
        children: buildLocations(node.children, required),
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Estructura de un árbol ya creado
// ---------------------------------------------------------------------------

// Deduce la estructura de las ubicaciones: en cada lugar, los niveles que
// aparecen y la cantidad más común de cada uno. Una fila con menos muebles no
// la cambia.
export function templateOf(roots: LocationNode[]): TemplateNode[] {
  return roots.length > 0 ? fromGroups([roots]) : [];
}

function fromGroups(groups: LocationNode[][]): TemplateNode[] {
  const names = [...new Set(groups.flat().map((node) => node.level_name))];
  return names.map((name) => {
    const present = groups.map((group) => group.filter((node) => node.level_name === name)).filter((group) => group.length > 0);
    const children = present.flat().map((node) => node.children).filter((group) => group.length > 0);
    return templateNode(name, mostCommon(present.map((group) => group.length)), fromGroups(children));
  });
}

// Lo que la estructura prevé dentro de una ubicación, siguiendo los niveles
// de su ruta (de la raíz a ella). Vacío si la ubicación se sale de la
// estructura.
export function templateInside(template: TemplateNode[], path: string[]): TemplateNode[] {
  let list = template;
  for (const levelName of path) {
    const found = list.find((node) => node.name === levelName);
    if (!found) return [];
    list = found.children;
  }
  return list;
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}
