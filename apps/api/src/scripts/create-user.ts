import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// Uso: npm run create-user -- --username ana --email ana@example.com --name "Ana Pérez"
// La contraseña se pide por teclado (sin mostrarse), para que no quede en el
// historial de la terminal ni en la lista de procesos.
const { values } = parseArgs({
  options: {
    username: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
  },
});

if (!values.username || !values.email || !values.name) {
  console.error('Uso: npm run create-user -- --username <usuario> --email <correo> --name "<nombre completo>"');
  process.exit(1);
}

async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write(question);
  muted = true;
  const answer = await rl.question("");
  rl.close();
  process.stdout.write("\n");
  return answer;
}

try {
  const password = await promptHidden("Contraseña: ");
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const { rows } = await pool.query<{ user_id: number }>(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id`,
    [values.username, values.email, await hashPassword(password), values.name],
  );
  console.log(`Usuario creado con id ${rows[0].user_id}`);
} catch (error) {
  console.error(`No se pudo crear el usuario: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
