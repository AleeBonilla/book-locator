import argon2 from "argon2";

// argon2id genera una sal aleatoria por cada hash y la incluye, junto con los
// parámetros de costo, en la propia cadena resultante:
//   $argon2id$v=19$m=65536,p=4,t=3$<sal>$<hash>
// Por eso basta guardar esa única cadena en users.password_hash.
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

// verify() lee la sal y los parámetros de la cadena guardada, recalcula el hash
// y compara. Devuelve false (no lanza) si la contraseña no coincide o si la
// cadena guardada está malformada.
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
