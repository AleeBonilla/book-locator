// Cliente de la API. La web la llama en /api, en el mismo origen: en
// desarrollo Vite reenvía /api a la API (vite.config.ts) y en producción lo
// hace el proxy inverso. Al ser el mismo origen, el navegador manda la cookie
// de sesión sin configurar CORS.
import { ApiError } from './api-types.ts';

const BASE = '/api';

// Cuerpo que no es JSON (p. ej. un plano SVG), con su Content-Type.
export interface RawBody {
  raw: string;
  contentType: string;
}

// Se avisa cuando la API responde 401 fuera de /auth: la sesión venció o se
// cerró en otra pestaña. El panel lo usa para volver al inicio de sesión.
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function send(method: string, path: string, body?: unknown | RawBody): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (isRawBody(body)) {
    headers['Content-Type'] = body.contentType;
    payload = body.raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(BASE + path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.');
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw await errorFrom(response);
  }
  return response;
}

// Respuesta JSON (o undefined si es 204).
export async function request<T>(method: string, path: string, body?: unknown | RawBody): Promise<T> {
  const response = await send(method, path, body);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

// Respuesta de texto: el plano SVG o la hoja de códigos CSV.
export async function requestText(method: string, path: string): Promise<string> {
  const response = await send(method, path);
  // Se decodifica a mano para conservar la marca BOM del CSV, que Excel usa
  // para reconocer UTF-8 (response.text() la quita).
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
}

// Convierte una respuesta de error { error, details? } de la API (docs/api.md)
// en un ApiError. `details` es una lista de campos o, en algunos casos, otro
// objeto (p. ej. el reporte del plano), que queda en `extra`.
async function errorFrom(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  // El 503 trae su motivo (p. ej. no hay esquema activo); otros 5xx, no.
  if ((response.status >= 500 && response.status !== 503) || !body?.error) {
    return new ApiError(response.status, 'El servidor no pudo completar la operación. Intente de nuevo en unos minutos.');
  }
  const details = Array.isArray(body.details) ? body.details : undefined;
  return new ApiError(response.status, body.error, details, body.details);
}

function isRawBody(body: unknown): body is RawBody {
  return typeof body === 'object' && body !== null && 'raw' in body && 'contentType' in body;
}
