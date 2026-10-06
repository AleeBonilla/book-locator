import type { PathStep, SearchResponse, SearchResult } from '../lib/api-types.ts';
import { ShelfDiagram } from './ShelfDiagram.tsx';

// La búsqueda pública no muestra la estructura interna (filas, caras,
// códigos, rangos): señala el mueble en el plano y, si hay rangos cargados por
// anaquel, cuál anaquel revisar.

const ORDINALES = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ordinal = (n: number) => ORDINALES[n - 1] ?? `${n}.º`;

const lista = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`;

const capitalizar = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Nivel por debajo de la figura marcada en el plano (p. ej. el anaquel), si
// el rango se cargó a ese nivel.
const shelfOf = (result: SearchResult): PathStep | undefined => result.below_highlight.at(-1);

// Agrupa los resultados por figura del plano: dos anaqueles del mismo mueble
// se describen juntos.
function byFigure(results: SearchResult[]): SearchResult[][] {
  const groups = new Map<string, SearchResult[]>();
  for (const result of results) {
    const key = result.highlight_code ?? result.path.at(-1)!.code;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.values()];
}

function Shelves({ results, tone }: { results: SearchResult[]; tone: 'encontrado' | 'vecino' }) {
  const shelves = results.map(shelfOf).filter((step): step is PathStep => step !== undefined);
  if (shelves.length === 0) return null;
  const positions = [...new Set(shelves.map((step) => step.position))].sort((a, b) => a - b);
  const level = shelves[0].level_name.toLowerCase();
  const total = shelves[0].siblings;
  return (
    <div className={`anaquel anaquel-${tone}`}>
      <ShelfDiagram positions={positions} total={total} />
      <p>
        <strong>
          {capitalizar(lista(positions.map(ordinal)))} {level}
        </strong>
        <span>contando desde arriba, de {total}</span>
      </p>
    </div>
  );
}

export function SearchResults({ response }: { response: SearchResponse }) {
  const containing = response.results.filter((result) => result.relation === 'contains');

  if (containing.length > 0) {
    const groups = byFigure(containing);
    return (
      <section className="resultado" aria-label={`Ubicación de ${response.code}`}>
        <p className="resultado-donde">
          <span className="marca marca-encontrado" aria-hidden="true" />
          {groups.length === 1
            ? 'Está en el mueble marcado en el plano.'
            : `Puede estar en cualquiera de los ${groups.length} muebles marcados en el plano.`}
        </p>
        {groups.length === 1 && <Shelves results={groups[0]} tone="encontrado" />}
        {groups.length === 1 && groups[0].length > 1 && (
          <p className="resultado-nota">Puede estar en cualquiera de los dos: revise ambos.</p>
        )}
      </section>
    );
  }

  // El código cae en un hueco entre dos rangos.
  const neighbors = response.results;
  const groups = byFigure(neighbors);
  return (
    <section className="resultado" aria-label={`Ubicación aproximada de ${response.code}`}>
      <p className="resultado-titulo">No hay un lugar asignado a esta signatura.</p>
      <p className="resultado-donde">
        <span className="marca marca-vecino" aria-hidden="true" />
        {groups.length > 1
          ? 'Por el orden de la colección, debería estar entre los dos muebles marcados en el plano.'
          : neighbors.length > 1
            ? 'Por el orden de la colección, debería estar en el mueble marcado en el plano, entre estos anaqueles.'
            : 'Por el orden de la colección, debería estar junto al mueble marcado en el plano.'}
      </p>
      {groups.length === 1 && <Shelves results={groups[0]} tone="vecino" />}
    </section>
  );
}
