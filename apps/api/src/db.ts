import "dotenv/config";
import pg from "pg";

// Un Pool mantiene varias conexiones abiertas y las reutiliza entre consultas,
// en vez de abrir una conexión nueva a Postgres por cada petición HTTP.
export const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Un error en una conexión inactiva del pool no debe tumbar el proceso.
pool.on("error", (error) => {
  console.error(`Error en una conexión inactiva de la base de datos: ${error.message}`);
});

export async function checkDatabase(): Promise<void> {
  const { rows } = await pool.query<{ now: Date }>("SELECT now()");
  console.log(`Base de datos accesible. Hora del servidor: ${rows[0].now.toISOString()}`);
}
