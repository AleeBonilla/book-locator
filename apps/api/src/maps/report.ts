import { compareCodes } from "../locations/codes.js";
import type { SvgInspection, SvgIssue } from "./inspect-svg.js";

// Reporte de un plano frente a las ubicaciones de su esquema
// (decisión 0003 §3). Es lo que ve el administrador al subir o validar un
// plano, y lo que se exigirá al publicar.

export interface MapReport {
  // El contenido es aceptable (sin problemas de seguridad ni de formato). Si
  // es false, el plano no se puede guardar.
  valid: boolean;
  issues: SvgIssue[];
  // Etiquetas loc-<código> encontradas.
  labels: number;
  // Errores que impiden publicar:
  unknown_codes: { code: string; line: number }[];
  malformed_labels: { id: string; line: number }[];
  duplicate_labels: string[];
  missing_required: { code: string; name: string }[];
  // Sin ningún error: el plano permite publicar el esquema.
  publishable: boolean;
}

export interface ReportLocation {
  code: string;
  name: string;
  range_required: boolean;
}

export function buildMapReport(inspection: SvgInspection, locations: ReportLocation[]): MapReport {
  const known = new Set(locations.map((location) => location.code));
  const labeled = new Set(inspection.labels.map((label) => label.code));

  const report: MapReport = {
    valid: inspection.issues.length === 0,
    issues: inspection.issues,
    labels: inspection.labels.length,
    unknown_codes: inspection.labels.filter((label) => !known.has(label.code)),
    malformed_labels: inspection.malformed_labels,
    duplicate_labels: inspection.duplicate_labels,
    missing_required: locations
      .filter((location) => location.range_required && !labeled.has(location.code))
      .map(({ code, name }) => ({ code, name }))
      .sort((a, b) => compareCodes(a.code, b.code)),
    publishable: false,
  };
  report.publishable =
    report.valid &&
    report.unknown_codes.length === 0 &&
    report.malformed_labels.length === 0 &&
    report.duplicate_labels.length === 0 &&
    report.missing_required.length === 0;
  return report;
}
