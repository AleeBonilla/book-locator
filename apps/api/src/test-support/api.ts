// Utilidades para pruebas de integración contra la base de desarrollo
// (apps/api/.env). No se compilan con la aplicación (ver tsconfig.json).
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";
import { SESSION_COOKIE, createSession } from "../auth/session.js";
import { checkDatabase, pool } from "../db.js";

export const databaseAvailable = await checkDatabase().then(
  () => true,
  () => false,
);

// Para { skip } de node:test: omite la prueba si la base no está levantada.
export const skipWithoutDatabase = databaseAvailable ? false : "PostgreSQL no disponible";

export interface ApiResponse {
  status: number;
  body: any;
}

export interface TestApi {
  userId: number;
  // Petición autenticada como el usuario de prueba.
  request(method: string, path: string, body?: unknown): Promise<ApiResponse>;
  // Petición sin cookie de sesión.
  anonymous(method: string, path: string, body?: unknown): Promise<ApiResponse>;
  // Elimina todo lo que creó el usuario de prueba, el usuario y cierra el servidor y el pool.
  close(): Promise<void>;
}

// Levanta la app en un puerto libre con un usuario de prueba recién creado.
export async function startTestApi(): Promise<TestApi> {
  const username = `prueba-${randomUUID()}`;
  const { rows } = await pool.query<{ user_id: number }>(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES ($1, $2, 'sin-contraseña', 'Usuario de prueba')
     RETURNING user_id`,
    [username, `${username}@example.com`],
  );
  const userId = rows[0].user_id;
  const { token } = await createSession(userId);

  // El servidor se levanta al final: si algo anterior falla, no queda un
  // servidor abierto que impida terminar al proceso de pruebas.
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  const send = async (method: string, path: string, body: unknown, cookie?: string): Promise<ApiResponse> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  return {
    userId,
    request: (method, path, body) => send(method, path, body, `${SESSION_COOKIE}=${token}`),
    anonymous: (method, path, body) => send(method, path, body),
    async close() {
      await pool.query(
        "DELETE FROM locations WHERE scheme_id IN (SELECT scheme_id FROM schemes WHERE created_by = $1)",
        [userId],
      );
      await pool.query("DELETE FROM schemes WHERE created_by = $1", [userId]);
      await pool.query("DELETE FROM users WHERE user_id = $1", [userId]); // sus sesiones se borran en cascada
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}
