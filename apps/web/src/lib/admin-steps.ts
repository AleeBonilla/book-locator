import type { MapReport, SchemeDetail } from './admin-types.ts';

export type Tab = 'ubicaciones' | 'plano';

export interface Step {
  title: string;
  detail: string;
  done: boolean;
  tab: Tab;
  // Ubicación a la que conviene ir para avanzar en el paso.
  focusCode?: string;
}

// Los pasos para publicar un esquema. Es una secuencia real (0003): cada paso
// dice qué falta y lleva a la pestaña donde se resuelve.
export function stepsFor(scheme: SchemeDetail, map: MapReport | null): Step[] {
  const count = countLocations(scheme.locations);
  const { required_count, required_with_range, uncovered_leaves, nested_marks } = scheme.assignment;
  const mapProblems = map
    ? map.missing_required.length + map.unknown_codes.length + map.malformed_labels.length + map.duplicate_labels.length
    : 0;
  return [
    {
      title: 'Estructura',
      detail: count === 0 ? 'Agregue las ubicaciones' : `${count} ubicaciones`,
      done: count > 0,
      tab: 'ubicaciones',
    },
    {
      title: 'Rangos',
      detail:
        required_count === 0
          ? 'Elija el nivel mínimo'
          : uncovered_leaves.length + nested_marks.length > 0
            ? 'Revise el nivel mínimo'
            : `${required_with_range} de ${required_count} con rango`,
      done: scheme.status === 'ASSIGNED',
      tab: 'ubicaciones',
      focusCode: scheme.assignment.missing_ranges[0] ?? scheme.assignment.uncovered_leaves[0],
    },
    {
      title: 'Plano',
      detail: !map ? 'Suba el plano' : mapProblems > 0 ? `${mapProblems} por corregir` : 'Completo',
      done: Boolean(map?.publishable),
      tab: 'plano',
    },
    {
      title: 'Publicación',
      detail: scheme.is_active ? 'En uso' : scheme.published_at ? 'Publicado' : 'Pendiente',
      done: Boolean(scheme.published_at),
      tab: 'ubicaciones',
    },
  ];
}

export function countLocations(nodes: SchemeDetail['locations']): number {
  return nodes.reduce((total, node) => total + 1 + countLocations(node.children), 0);
}
