import "dotenv/config";
import pg from "pg";

// Un Pool mantiene varias conexiones abiertas y las reutiliza entre consultas,
// en vez de abrir una conexión nueva a Postgres por cada petición HTTP.
//
// En producción la conexión llega como DATABASE_URL (así la entrega Neon,
// con ?sslmode=require para cifrarla); en desarrollo, por partes (DB_*).
export const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
);

// Un error en una conexión inactiva del pool no debe tumbar el proceso.
pool.on("error", (error) => {
  console.error(`Error en una conexión inactiva de la base de datos: ${error.message}`);
});

// Lo que reciben las funciones de queries.ts: el pool (cada consulta usa una
// conexión cualquiera) o un cliente concreto dentro de una transacción. Así la
// misma consulta sirve dentro y fuera de withTransaction.
export type Queryable = pg.Pool | pg.PoolClient;

// Ejecuta `work` en una transacción: todas sus consultas se confirman juntas
// con COMMIT o, si algo lanza un error, se deshacen juntas con ROLLBACK. Las
// consultas deben usar el `client` recibido, no el pool: el pool podría
// darles otra conexión, que quedaría fuera de la transacción. Las
// restricciones diferidas (p. ej. el trigger locations_code_hierarchy) se
// comprueban en el COMMIT, así que su error también sale de aquí.
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<void> {
  const { rows } = await pool.query<{ now: Date }>("SELECT now()");
  console.log(`Base de datos accesible. Hora del servidor: ${rows[0].now.toISOString()}`);
}
