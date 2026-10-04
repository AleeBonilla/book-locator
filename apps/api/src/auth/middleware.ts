import type { NextFunction, Request, Response } from "express";
import { findSessionUserId, SESSION_COOKIE } from "./session.js";

// Añade userId al tipo Request para que TypeScript lo conozca en las rutas.
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

// Middleware de autenticación: identifica quién hace la petición a partir de la
// cookie. Si hay sesión válida guarda el usuario en req.userId y llama a next()
// para continuar; si no, corta la petición con 401.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  const userId = typeof token === "string" ? await findSessionUserId(token) : null;

  if (userId === null) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  req.userId = userId;
  next();
}
