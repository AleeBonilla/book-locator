// Formas de las respuestas de la API de administración (docs/api.md). El
// prototipo las reproduce para que conectar el backend no cambie las
// pantallas.

export type SchemeStatus = 'DRAFT' | 'LOCATIONS_DEFINED' | 'PARTIALLY_ASSIGNED' | 'ASSIGNED';

export interface SchemeRow {
  scheme_id: number;
  name: string;
  status: SchemeStatus;
  short_description: string | null;
  has_map: boolean;
  is_active: boolean;
  published_at: string | null;
  updated_at: string;
}

export interface LocationNode {
  location_id: number;
  parent_location_id: number | null;
  code: string;
  name: string;
  level: number;
  level_name: string;
  level_name_override: string | null;
  display_level_name: string;
  sort_order: number;
  range_required: boolean;
  range: { start: string; end: string } | null;
  children: LocationNode[];
}

export interface AssignmentReport {
  status: SchemeStatus;
  required_count: number;
  required_with_range: number;
  uncovered_leaves: string[];
  nested_marks: string[];
  missing_ranges: string[];
}

export interface SchemeDetail extends SchemeRow {
  assignment: Omit<AssignmentReport, 'status'>;
  locations: LocationNode[];
}

export interface MapReport {
  valid: boolean;
  issues: { line: number; message: string }[];
  labels: number;
  unknown_codes: { code: string; line: number }[];
  malformed_labels: { id: string; line: number }[];
  duplicate_labels: string[];
  missing_required: { code: string; name: string }[];
  publishable: boolean;
}
