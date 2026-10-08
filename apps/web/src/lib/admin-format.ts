import type { SchemeRow } from './admin-types.ts';

// Estado del esquema dicho en palabras, para quien administra.
export function statusText(scheme: SchemeRow): string {
  if (scheme.is_active) return 'En uso';
  if (scheme.published_at) return 'Publicado';
  switch (scheme.status) {
    case 'DRAFT':
      return 'Sin ubicaciones';
    case 'LOCATIONS_DEFINED':
      return 'Sin rangos';
    case 'PARTIALLY_ASSIGNED':
      return 'Faltan rangos';
    case 'ASSIGNED':
      return scheme.has_map ? 'Listo para publicar' : 'Falta el plano';
  }
}

const dateFormat = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

// Descarga un texto como archivo desde el navegador.
export function downloadText(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
