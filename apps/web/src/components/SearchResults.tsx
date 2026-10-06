import type { PathStep, SearchResponse, SearchResult } from '../lib/api-types.ts';
import { ShelfDiagram } from './ShelfDiagram.tsx';
import { SpineLabel } from './SpineLabel.tsx';

const ORDINALES = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ordinal = (n: number) => ORDINALES[n - 1] ?? `${n}.º`;

// Ruta hasta la figura resaltada en el plano: «Fila 6, Cara 1, Mueble 10».
function drawnPath(result: SearchResult): PathStep[] {
  return result.path.slice(0, result.path.length - result.below_highlight.length);
}

function Place({ result, showRange = true }: { result: SearchResult; showRange?: boolean }) {
  const drawn = drawnPath(result);
  return (
    <div className="lugar">
      <ol className="lugar-ruta">
        {drawn.map((step, index) => (
          <li key={step.code} className={index === drawn.length - 1 ? 'lugar-paso lugar-paso-marcado' : 'lugar-paso'}>
            {step.name}
          </li>
        ))}
      </ol>
      {result.below_highlight.map((step) => (
        <div key={step.code} className="lugar-anaquel">
          <ShelfDiagram position={step.position} total={step.siblings} />
          <p>
            <strong>{step.name}</strong>
            <span>
              El {ordinal(step.position)} de {step.siblings}, contando desde arriba
            </span>
          </p>
        </div>
      ))}
      {showRange && (
        <p className="lugar-rango">
          Rango: {result.range.start} a {result.range.end}
        </p>
      )}
    </div>
  );
}

export function SearchResults({ response }: { response: SearchResponse }) {
  const containing = response.results.filter((result) => result.relation === 'contains');

  if (containing.length === 1) {
    return (
      <section className="resultado" aria-labelledby="resultado-titulo">
        <h2 id="resultado-titulo" className="visualmente-oculto">
          Ubicación de {response.code}
        </h2>
        <div className="resultado-principal">
          <SpineLabel code={response.code} />
          <Place result={containing[0]} />
        </div>
      </section>
    );
  }

  if (containing.length > 1) {
    return (
      <section className="resultado" aria-labelledby="resultado-titulo">
        <div className="resultado-cabecera">
          <SpineLabel code={response.code} />
          <div>
            <h2 id="resultado-titulo" className="resultado-titulo">
              Puede estar en {containing.length} anaqueles
            </h2>
            <p className="resultado-nota">Los rangos de estos anaqueles se superponen: revise ambos.</p>
          </div>
        </div>
        {containing.map((result) => (
          <Place key={result.path.at(-1)!.code} result={result} />
        ))}
      </section>
    );
  }

  const before = response.results.find((result) => result.relation === 'before');
  const after = response.results.find((result) => result.relation === 'after');
  return (
    <section className="resultado" aria-labelledby="resultado-titulo">
      <div className="resultado-cabecera">
        <SpineLabel code={response.code} />
        <div>
          <h2 id="resultado-titulo" className="resultado-titulo">
            No hay un anaquel asignado a esta signatura
          </h2>
          <p className="resultado-nota">
            {before && after
              ? 'Por el orden de la colección, debería estar entre estos dos anaqueles, marcados en el plano.'
              : 'Por el orden de la colección, debería estar junto a este anaquel, marcado en el plano.'}
          </p>
        </div>
      </div>
      {before && (
        <div className="vecina">
          <p className="vecina-titulo">Antes, termina en {before.range.end}</p>
          <Place result={before} showRange={false} />
        </div>
      )}
      {after && (
        <div className="vecina">
          <p className="vecina-titulo">Después, empieza en {after.range.start}</p>
          <Place result={after} showRange={false} />
        </div>
      )}
    </section>
  );
}
