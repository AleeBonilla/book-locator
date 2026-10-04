import { Router } from "express";
import type { CookieOptions } from "express";
import { pool } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { requireAuth } from "./middleware.js";
import { createSession, deleteSession, SESSION_COOKIE } from "./session.js";

// Atributos de la cookie:
// - httpOnly: el JavaScript de la página no puede leerla (mitiga robo por XSS).
// - sameSite "lax": el navegador no la envía en peticiones POST desde otros
//   sitios (mitiga CSRF).
// - secure: solo viaja por HTTPS; se activa en producción.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// Hash de una contraseña inventada. Si el usuario no existe, verificamos contra
// este hash de todos modos para que la respuesta tarde lo mismo que con un
// usuario real y no se pueda averiguar qué usuarios existen midiendo el tiempo.
const dummyHash = hashPassword("contraseña-que-no-pertenece-a-nadie");

type UserRow = { user_id: number; password_hash: string; enabled: boolean };

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { identifier, password } = req.body ?? {};

  if (typeof identifier !== "string" || typeof password !== "string" || !identifier || !password) {
    res.status(400).json({ error: "Se requieren identifier y password" });
    return;
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT user_id, password_hash, enabled
       FROM users
      WHERE lower(username) = lower($1) OR lower(email) = lower($1)`,
    [identifier],
  );
  const user = rows[0];

  const passwordOk = await verifyPassword(user?.password_hash ?? (await dummyHash), password);

  // Mismo mensaje para "no existe", "contraseña incorrecta" y "deshabilitado":
  // no le decimos a un atacante cuál de los casos fue.
  if (!user || !passwordOk || !user.enabled) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const { token, expiresAt } = await createSession(user.user_id);
  await pool.query("UPDATE users SET last_login_at = now() WHERE user_id = $1", [user.user_id]);

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  res.json({ status: "ok" });
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];

  if (typeof token === "string") {
    await deleteSession(token);
  }

  // clearCookie debe repetir los mismos atributos con que se creó la cookie.
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ status: "ok" });
});

// requireAuth se ejecuta antes del manejador: si no hay sesión válida responde
// 401 y el manejador nunca llega a correr.
authRouter.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT user_id, username, email, full_name FROM users WHERE user_id = $1",
    [req.userId],
  );
  res.json(rows[0]);
});
