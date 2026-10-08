import type { MapReport, SchemeDetail } from './admin-types.ts';

export type Tab = 'estructura' | 'rangos' | 'plano' | 'publicacion';

export interface Step {
  tab: Tab;
  title: string;
  detail: string;
  done: boolean;
  // Ubicación a la que conviene ir para avanzar en el paso.
  focusCode?: string;
}

// Los pasos para publicar un esquema, que son también las secciones de su
// página. Es una secuencia real (0003): cada paso dice qué falta.
export function stepsFor(scheme: SchemeDetail, map: MapReport | null): Step[] {
  const count = countLocations(scheme.locations);
  const { required_count, required_with_range, uncovered_leaves, nested_marks } = scheme.assignment;
  const mapProblems = map
    ? map.missing_required.length + map.unknown_codes.length + map.malformed_labels.length + map.duplicate_labels.length
    : 0;
  const ready = scheme.status === 'ASSIGNED' && Boolean(map?.publishable);
  return [
    {
      tab: 'estructura',
      title: 'Estructura',
      detail: count === 0 ? 'Defina la estructura' : `${count} ubicaciones`,
      done: count > 0,
    },
    {
      tab: 'rangos',
      title: 'Rangos',
      detail:
        count === 0
          ? 'Falta la estructura'
          : required_count === 0
            ? 'Elija el nivel mínimo'
            : uncovered_leaves.length + nested_marks.length > 0
              ? 'Revise el nivel mínimo'
              : `${required_with_range} de ${required_count} con rango`,
      done: scheme.status === 'ASSIGNED',
      focusCode: scheme.assignment.missing_ranges[0] ?? scheme.assignment.uncovered_leaves[0],
    },
    {
      tab: 'plano',
      title: 'Plano',
      detail: !map ? 'Suba el plano' : mapProblems > 0 ? `${mapProblems} por corregir` : 'Completo',
      done: Boolean(map?.publishable),
    },
    {
      tab: 'publicacion',
      title: 'Publicación',
      detail: scheme.is_active
        ? 'En uso'
        : scheme.published_at
          ? 'Publicado'
          : ready
            ? 'Listo para publicar'
            : 'Faltan pasos',
      done: Boolean(scheme.published_at),
    },
  ];
}

// Sección con la que abre la página: el primer paso sin terminar.
export function firstPending(steps: Step[]): Tab {
  return steps.find((step) => !step.done)?.tab ?? 'publicacion';
}

export function countLocations(nodes: SchemeDetail['locations']): number {
  return nodes.reduce((total, node) => total + 1 + countLocations(node.children), 0);
}
