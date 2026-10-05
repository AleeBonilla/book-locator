// Análisis del mínimo de asignación y cálculo del estado de un esquema
// (decisión 0003 §2). Es una función pura: recibe las ubicaciones ya leídas.

export type SchemeStatus = "DRAFT" | "LOCATIONS_DEFINED" | "PARTIALLY_ASSIGNED" | "ASSIGNED";

export interface AssignmentLocation {
  location_id: number;
  parent_location_id: number | null;
  code: string;
  range_required: boolean;
  has_range: boolean;
}

export interface AssignmentReport {
  status: SchemeStatus;
  // Ubicaciones marcadas como mínimo de asignación.
  required_count: number;
  // De ellas, cuántas tienen rango.
  required_with_range: number;
  // Problemas que impiden llegar a ASSIGNED, por código de ubicación:
  uncovered_leaves: string[]; // hojas sin ninguna marca en su camino desde la raíz
  nested_marks: string[]; // marcas con otra marca en un ancestro
  missing_ranges: string[]; // marcas sin rango
}

export function analyzeAssignment(locations: AssignmentLocation[]): AssignmentReport {
  const children = new Map<number | null, AssignmentLocation[]>();
  for (const location of locations) {
    const siblings = children.get(location.parent_location_id) ?? [];
    siblings.push(location);
    children.set(location.parent_location_id, siblings);
  }

  const report: AssignmentReport = {
    status: "DRAFT",
    required_count: 0,
    required_with_range: 0,
    uncovered_leaves: [],
    nested_marks: [],
    missing_ranges: [],
  };

  // Recorre cada camino desde las raíces llevando si ya pasó por una marca.
  const visit = (location: AssignmentLocation, markAbove: boolean): void => {
    if (location.range_required) {
      report.required_count++;
      if (location.has_range) report.required_with_range++;
      else report.missing_ranges.push(location.code);
      if (markAbove) report.nested_marks.push(location.code);
    }
    const covered = markAbove || location.range_required;
    const below = children.get(location.location_id) ?? [];
    if (below.length === 0 && !covered) report.uncovered_leaves.push(location.code);
    for (const child of below) visit(child, covered);
  };
  for (const root of children.get(null) ?? []) visit(root, false);

  report.status = statusOf(locations, report);
  return report;
}

function statusOf(locations: AssignmentLocation[], report: AssignmentReport): SchemeStatus {
  if (locations.length === 0) return "DRAFT";
  if (!locations.some((location) => location.has_range)) return "LOCATIONS_DEFINED";
  const complete =
    report.uncovered_leaves.length === 0 &&
    report.nested_marks.length === 0 &&
    report.missing_ranges.length === 0;
  return complete ? "ASSIGNED" : "PARTIALLY_ASSIGNED";
}
