import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db.js";

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// SHA-256 basta aquí (a diferencia de las contraseñas): el token ya tiene 256
// bits de aleatoriedad, así que no se puede adivinar por fuerza bruta.
function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

// Devuelve el token en claro, que solo existe aquí y en la cookie del usuario.
export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt],
  );

  return { token, expiresAt };
}

// Devuelve el id del usuario si el token es válido, no ha expirado y el usuario
// sigue habilitado; si no, null.
export async function findSessionUserId(token: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT s.user_id
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.enabled`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}
