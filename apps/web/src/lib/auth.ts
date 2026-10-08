// Sesión del personal (docs/api.md, Autenticación). La API guarda la sesión
// en una cookie HttpOnly: la web nunca ve el token, solo pregunta quién es el
// usuario (GET /auth/me) y pide entrar o salir.
import { request } from './http.ts';

export interface User {
  user_id: number;
  username: string;
  email: string;
  full_name: string | null;
}

export async function login(identifier: string, password: string): Promise<void> {
  await request('POST', '/auth/login', { identifier, password });
}

export async function logout(): Promise<void> {
  await request('POST', '/auth/logout');
}

// El usuario de la sesión actual; lanza ApiError 401 si no hay sesión.
export function currentUser(): Promise<User> {
  return request<User>('GET', '/auth/me');
}
