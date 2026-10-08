import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { normalizeClassification } from "@bjff/classification";
import { classificationSortKey } from "@bjff/classification/sort-key";
import { pool, withTransaction, type Queryable } from "../db.js";
import { listLocations, type StoredRange } from "../locations/queries.js";
import { createLocations } from "../locations/service.js";
import type { BatchLocationInput } from "../locations/routes.js";
import { uploadMap } from "../maps/service.js";
import { activateScheme, publishScheme } from "../schemes/publication.js";
import { createScheme, lockEditableScheme, refreshSchemeStatus } from "../schemes/service.js";

// Crea un esquema de demostración con la sala general de la BJFF:
//
// - la estructura del plano: Fila (1 a 10) › Cara (1 y 2) › Mueble (1 a 16; 14
//   en la fila 4) › Anaquel, con los muebles como mínimo para publicar;
// - los rangos del inventario, limpios (database/demo/sala-general.json; los
//   supuestos están en database/demo/README.md);
// - el plano con las figuras etiquetadas loc-<fila>-<cara>-<mueble>.
//
// Luego lo publica y, con --activate, lo pone en uso en la búsqueda pública.
//
//   npm run seed-demo -w api -- --user ana --activate
//
// Sin --user usa el primer usuario habilitado. Con DATABASE_URL carga la demo
// en esa base (p. ej. la de producción en Neon).
const { values } = parseArgs({
  options: {
    user: { type: "string" },
    name: { type: "string", default: "Sala general (demo)" },
    activate: { type: "boolean", default: false },
  },
});

interface DemoData {
  estantes_vacios: number[];
  muebles: { codigo: string; estante: number; anaqueles: [string, string][] }[];
}

const demoDir = new URL("../../../../database/demo/", import.meta.url);

try {
  const data: DemoData = JSON.parse(await readFile(new URL("sala-general.json", demoDir), "utf8"));
  const svg = await readFile(new URL("plano-sala-general.svg", demoDir), "utf8");
  const userId = await findUser(values.user);

  const scheme = await createScheme(
    { name: values.name!, short_description: "Demostración: inventario de estantes limpio sobre el plano de la sala general" },
    userId,
  );
  console.log(`Esquema ${scheme.scheme_id}: «${scheme.name}»`);

  const { created } = await createLocations(scheme.scheme_id, { parent_location_id: null, locations: structure(data) }, userId);
  console.log(`Ubicaciones: ${created}`);

  const ranges = await loadRanges(scheme.scheme_id, data, userId);
  console.log(`Rangos: ${ranges.anaqueles} anaqueles y ${ranges.derived} ubicaciones con rango calculado (estado ${ranges.status})`);

  const report = await uploadMap(scheme.scheme_id, svg);
  console.log(`Plano: ${report.labels} figuras etiquetadas${report.publishable ? "" : ` (no publicable: ${JSON.stringify(report).slice(0, 300)})`}`);

  await publishScheme(scheme.scheme_id, userId);
  console.log("Publicado.");
  if (values.activate) {
    await activateScheme(scheme.scheme_id);
    console.log("Activado: la búsqueda pública usa este esquema.");
  }
} catch (error) {
  console.error(`No se pudo crear la demostración: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

async function findUser(username: string | undefined): Promise<number> {
  const { rows } = await pool.query<{ user_id: number }>(
    username
      ? "SELECT user_id FROM users WHERE lower(username) = lower($1)"
      : "SELECT user_id FROM users WHERE enabled ORDER BY user_id LIMIT 1",
    username ? [username] : [],
  );
  if (!rows[0]) {
    throw new Error(
      username ? `No existe el usuario ${username}` : "No hay usuarios: créelo antes con npm run create-user -w api",
    );
  }
  return rows[0].user_id;
}

// El árbol de ubicaciones, con los nombres que usa el panel («Nivel N»). Los
// muebles vienen en el orden del plano, así que las posiciones coinciden con
// sus códigos (1-1-1, 1-1-2…).
function structure(data: DemoData): BatchLocationInput[] {
  const filas = new Map<number, Map<number, DemoData["muebles"]>>();
  for (const mueble of data.muebles) {
    const [fila, cara] = mueble.codigo.split("-").map(Number);
    const caras = filas.get(fila) ?? new Map();
    caras.set(cara, [...(caras.get(cara) ?? []), mueble]);
    filas.set(fila, caras);
  }
  return [...filas].map(([fila, caras]) => ({
    name: `Fila ${fila}`,
    level_name: "Fila",
    children: [...caras].map(([cara, muebles]) => ({
      name: `Cara ${cara}`,
      level_name: "Cara",
      children: muebles.map((mueble) => ({
        name: `Mueble ${mueble.codigo.split("-")[2]}`,
        level_name: "Mueble",
        range_required: true,
        children: mueble.anaqueles.map((_, index) => ({ name: `Anaquel ${index + 1}`, level_name: "Anaquel" })),
      })),
    })),
  }));
}

// Asigna los rangos de los anaqueles y calcula los de sus ancestros (el
// primero inicio y el último fin de los hijos, decisión 0005), todo en una
// transacción y con dos sentencias en lugar de una por ubicación.
async function loadRanges(schemeId: number, data: DemoData, userId: number) {
  return withTransaction(async (client) => {
    const scheme = await lockEditableScheme(client, schemeId);
    const locations = await listLocations(client, schemeId);
    const byCode = new Map(locations.map((location) => [location.code, location]));
    const ranges = new Map<number, StoredRange>();

    for (const mueble of data.muebles) {
      mueble.anaqueles.forEach(([start, end], index) => {
        const location = byCode.get(`${mueble.codigo}-${index + 1}`);
        if (!location) throw new Error(`Falta la ubicación ${mueble.codigo}-${index + 1}`);
        ranges.set(location.location_id, storedRange(start, end, location.code));
      });
    }
    const anaqueles = ranges.size;

    // De abajo hacia arriba: listLocations ordena por nivel y posición, así
    // que recorrida al revés cada padre se calcula después de sus hijos.
    for (const location of [...locations].reverse()) {
      if (ranges.has(location.location_id)) continue;
      const children = locations
        .filter((child) => child.parent_location_id === location.location_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((child) => ranges.get(child.location_id));
      if (children.length === 0 || children.some((range) => !range)) continue;
      const first = children[0]!;
      const last = children[children.length - 1]!;
      ranges.set(location.location_id, { start_raw: first.start_raw, start_key: first.start_key, end_raw: last.end_raw, end_key: last.end_key });
    }

    await saveRanges(client, ranges, userId);
    const report = await refreshSchemeStatus(client, scheme);
    return { anaqueles, derived: ranges.size - anaqueles, status: report.status };
  });
}

function storedRange(start: string, end: string, code: string): StoredRange {
  const [a, b] = [normalizeClassification(start), normalizeClassification(end)];
  if (a.status === "invalid" || b.status === "invalid") {
    throw new Error(`Código inválido en ${code}: ${a.status === "invalid" ? `${start} (${a.reason})` : ""} ${b.status === "invalid" ? `${end} (${b.reason})` : ""}`);
  }
  const range = { start_raw: start, end_raw: end, start_key: classificationSortKey(a.code), end_key: classificationSortKey(b.code) };
  if (Buffer.compare(range.start_key, range.end_key) > 0) throw new Error(`En ${code} el inicio ${start} va después del fin ${end}`);
  return range;
}

async function saveRanges(db: Queryable, ranges: Map<number, StoredRange>, userId: number): Promise<void> {
  const entries = [...ranges];
  await db.query(
    `UPDATE locations l
        SET range_start_raw = r.start_raw, range_end_raw = r.end_raw,
            range_start_key = r.start_key, range_end_key = r.end_key,
            updated_by = $1, updated_at = now()
       FROM unnest($2::int[], $3::text[], $4::text[], $5::bytea[], $6::bytea[])
         AS r(location_id, start_raw, end_raw, start_key, end_key)
      WHERE l.location_id = r.location_id`,
    [
      userId,
      entries.map(([id]) => id),
      entries.map(([, range]) => range.start_raw),
      entries.map(([, range]) => range.end_raw),
      entries.map(([, range]) => range.start_key),
      entries.map(([, range]) => range.end_key),
    ],
  );
}
