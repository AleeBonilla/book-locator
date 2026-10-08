// Búsqueda pública (docs/api.md, decisión 0007): no requiere sesión.
import type { SearchResponse } from './api-types.ts';
import { request, requestText } from './http.ts';

// Plano del esquema activo. La API lo sirve con ETag, así que el navegador
// lo vuelve a descargar solo si cambió.
export function fetchMap(): Promise<string> {
  return requestText('GET', '/search/map');
}

// Dónde está el código. 422 si no se puede interpretar (con el motivo en
// details); 503 si no hay ningún esquema activo.
export function search(code: string): Promise<SearchResponse> {
  return request<SearchResponse>('GET', `/search?code=${encodeURIComponent(code)}`);
}
