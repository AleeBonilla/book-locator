import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { MapCanvas, type Insets, type MapHighlight } from '../components/MapCanvas.tsx';
import { SearchResults } from '../components/SearchResults.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { ApiError, type SearchResponse } from '../lib/api-types.ts';
import { fetchMap, search } from '../lib/mock-api.ts';
import { sanitizeMap } from '../lib/sanitize-map.ts';
import './SearchPage.css';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; response: SearchResponse }
  | { status: 'invalid'; reason: string }
  | { status: 'unavailable' };

// Respuesta de una búsqueda, con la búsqueda a la que corresponde.
type Answer = SearchState & { request: string };

type MapState = { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'unavailable' };

// Signaturas para revisar cada estado del diseño en el prototipo.
const EJEMPLOS = [
  { code: '001.42 H557m4', label: 'un anaquel' },
  { code: '658.8 K87m14', label: 'dos anaqueles' },
  { code: '863 M378a', label: 'rango por mueble' },
  { code: '720 B12', label: 'entre dos muebles' },
  { code: '004.0195-236-i^2', label: 'mal escrita' },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('codigo') ?? '');
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Sube al volver a buscar la misma signatura, para repetir la búsqueda.
  const [attempt, setAttempt] = useState(0);
  const [map, setMap] = useState<MapState>({ status: 'loading' });
  const [focusKey, setFocusKey] = useState(0);
  const [insets, setInsets] = useState<Insets>({ left: 0, bottom: 0 });
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMap().then(
      (svg) => setMap({ status: 'ready', svg: sanitizeMap(svg) }),
      () => setMap({ status: 'unavailable' }),
    );
  }, []);

  // Zona del plano que tapa el panel: a la izquierda en escritorio, abajo en
  // celular. El plano encuadra los resultados en el resto. Se mide en el
  // momento (measureInsets) y, además, se guarda para ubicar los controles.
  const measureInsets = useCallback((): Insets => {
    const el = panel.current;
    if (!el) return { left: 0, bottom: 0 };
    const parent = el.parentElement!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return matchMedia('(max-width: 719px)').matches
      ? { left: 0, bottom: parent.bottom - box.top }
      : { left: box.right - parent.left + 16, bottom: 0 };
  }, []);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => setInsets(measureInsets());
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, [measureInsets]);

  // La signatura viaja en la dirección (?codigo=…), así una búsqueda se
  // puede compartir o recargar. Si cambia la dirección (atrás, adelante, un
  // ejemplo), el campo toma el nuevo valor durante el render.
  const query = params.get('codigo') ?? '';
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    setCode(query);
  }

  // El estado se deriva: si la última respuesta no corresponde a la búsqueda
  // actual, todavía se está buscando.
  const request = `${query.trim()}#${attempt}`;
  const state: SearchState = !query.trim()
    ? { status: 'idle' }
    : answer?.request === request
      ? answer
      : { status: 'loading' };

  useEffect(() => {
    const value = query.trim();
    if (!value) return;
    let current = true;
    const settle = (next: SearchState) => {
      if (current) setAnswer({ ...next, request: `${value}#${attempt}` });
    };
    search(value).then(
      (response) => {
        settle({ status: 'done', response });
        if (current) setFocusKey((key) => key + 1);
      },
      (error) =>
        settle(
          error instanceof ApiError && error.status === 422
            ? { status: 'invalid', reason: error.details?.[0]?.message ?? error.message }
            : { status: 'unavailable' },
        ),
    );
    // Una búsqueda más nueva descarta la respuesta de esta.
    return () => {
      current = false;
    };
  }, [query, attempt]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() === query.trim()) {
      setAttempt((value) => value + 1);
      return;
    }
    const next = new URLSearchParams(params);
    next.set('codigo', code.trim());
    setParams(next);
  };

  const showExample = (example: string) => {
    const next = new URLSearchParams(params);
    next.set('codigo', example);
    setParams(next);
  };

  const response = state.status === 'done' ? state.response : null;
  const highlights = useMemo<MapHighlight[]>(() => {
    if (!response) return [];
    const byCode = new Map<string, MapHighlight>();
    for (const result of response.results) {
      if (!result.highlight_code) continue;
      const kind = result.relation === 'contains' ? 'found' : 'neighbor';
      if (byCode.get(result.highlight_code)?.kind !== 'found') byCode.set(result.highlight_code, { code: result.highlight_code, kind });
    }
    return [...byCode.values()];
  }, [response]);

  const invalid = state.status === 'invalid';

  return (
    <div className="busqueda">
      <SiteHeader />
      <main className="busqueda-principal" style={{ '--lienzo-inferior': `${insets.bottom}px` } as CSSProperties}>
        {map.status === 'ready' && (
          <MapCanvas svg={map.svg} highlights={highlights} getInsets={measureInsets} focusKey={focusKey} />
        )}
        {map.status === 'loading' && <div className="busqueda-cargando" aria-hidden="true" />}

        <div ref={panel} className={state.status === 'done' ? 'panel con-resultado' : 'panel'}>
          <h1 className="titulo panel-titulo">¿Dónde está su libro?</h1>

          {state.status === 'unavailable' || map.status === 'unavailable' ? (
            <div className="aviso" role="status">
              <p className="aviso-titulo">La búsqueda no está disponible en este momento.</p>
              <p>Consulte en el mostrador de la biblioteca.</p>
            </div>
          ) : (
            <form className="formulario" onSubmit={submit} role="search">
              <label htmlFor="signatura" className="campo-etiqueta">
                Signatura
              </label>
              <div className="formulario-fila">
                <input
                  id="signatura"
                  className={invalid ? 'campo campo-error' : 'campo'}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="001.42 H557m4"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? 'signatura-error' : state.status === 'idle' ? 'signatura-ayuda' : undefined}
                  enterKeyHint="search"
                />
                <button type="submit" className="boton-principal" disabled={state.status === 'loading'}>
                  {state.status === 'loading' ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              {invalid ? (
                <p id="signatura-error" className="campo-mensaje-error">
                  No se reconoce esa signatura. Escríbala como aparece en el catálogo, por ejemplo 001.42 H557m4.
                </p>
              ) : (
                state.status === 'idle' && (
                  <p id="signatura-ayuda" className="campo-ayuda">
                    Cópiela del catálogo, tal como aparece en el registro del libro.
                  </p>
                )
              )}
            </form>
          )}

          <div aria-live="polite">
            {state.status === 'done' && <SearchResults response={state.response} />}
          </div>

          {state.status === 'idle' && (
            <div className="ejemplos">
              <p className="ejemplos-titulo">Ejemplos para revisar el diseño</p>
              <ul>
                {EJEMPLOS.map((example) => (
                  <li key={example.code}>
                    <button type="button" className="ejemplo" onClick={() => showExample(example.code)}>
                      <span className="ejemplo-codigo">{example.code}</span>
                      <span className="ejemplo-descripcion">{example.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
