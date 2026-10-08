// Tipos de las respuestas del backend (docs/api.md, decisión 0007). El
// prototipo los reproduce para que conectar la API real no cambie las
// pantallas.

export interface PathStep {
  location_id: number;
  code: string;
  name: string;
  level_name: string;
  position: number;
  siblings: number;
}

export interface SearchResult {
  relation: 'contains' | 'before' | 'after';
  range: { start: string; end: string };
  path: PathStep[];
  highlight_code: string | null;
  below_highlight: PathStep[];
}

export interface SearchResponse {
  code: string;
  scheme: { scheme_id: number; name: string };
  found: boolean;
  results: SearchResult[];
}

// Error con el formato { error, details? } de la API.
export class ApiError extends Error {
  readonly status: number;
  readonly details?: { path: string; message: string }[];
  // Detalle con otra forma, p. ej. el reporte del plano en un 422.
  readonly extra?: unknown;

  constructor(status: number, message: string, details?: { path: string; message: string }[], extra?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.extra = extra;
  }
}
