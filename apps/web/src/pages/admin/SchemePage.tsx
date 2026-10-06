import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AddLocationForm, LocationPanel } from '../../components/admin/LocationPanel.tsx';
import { LocationTree } from '../../components/admin/LocationTree.tsx';
import { MapTab } from '../../components/admin/MapTab.tsx';
import { SchemeSteps } from '../../components/admin/SchemeSteps.tsx';
import { stepsFor, type Tab } from '../../lib/admin-steps.ts';
import { statusText } from '../../lib/admin-format.ts';
import type { LocationNode, MapReport, SchemeDetail } from '../../lib/admin-types.ts';
import { ApiError } from '../../lib/api-types.ts';
import * as api from '../../lib/mock-admin.ts';

interface Indexed {
  node: LocationNode;
  siblings: LocationNode[];
  ancestors: number[];
}

// Índice del árbol: cada ubicación con sus hermanas y sus ancestros.
function indexTree(nodes: LocationNode[], ancestors: number[] = [], map = new Map<number, Indexed>()) {
  for (const node of nodes) {
    map.set(node.location_id, { node, siblings: nodes, ancestors });
    indexTree(node.children, [...ancestors, node.location_id], map);
  }
  return map;
}

export function SchemePage() {
  const schemeId = Number(useParams().schemeId);
  const navigate = useNavigate();
  const [scheme, setScheme] = useState<SchemeDetail | null>(null);
  const [mapReport, setMapReport] = useState<MapReport | null>(null);
  const [tab, setTab] = useState<Tab>('ubicaciones');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const activateDialog = useRef<HTMLDialogElement>(null);

  const reload = useCallback(async () => {
    const [detail, report] = await Promise.all([api.getScheme(schemeId), api.getMapReport(schemeId)]);
    setScheme(detail);
    setMapReport(report);
  }, [schemeId]);

  useEffect(() => {
    let current = true;
    Promise.all([api.getScheme(schemeId), api.getMapReport(schemeId)]).then(
      ([detail, report]) => {
        if (!current) return;
        setScheme(detail);
        setMapReport(report);
      },
      () => current && setError('No existe ese esquema.'),
    );
    return () => {
      current = false;
    };
  }, [schemeId]);

  // Ejecuta un cambio y recarga el esquema; si falla, muestra el motivo que da
  // la API (p. ej. «La estructura no se puede modificar…»).
  const run = useCallback(
    async (change: () => Promise<void>) => {
      setError(null);
      try {
        await change();
        await reload();
        return true;
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'No se pudo completar la acción.');
        await reload();
        return false;
      }
    },
    [reload],
  );

  const index = useMemo(() => indexTree(scheme?.locations ?? []), [scheme]);
  const selected = selectedId === null ? undefined : index.get(selectedId);
  const byCode = useMemo(() => new Map([...index.values()].map((entry) => [entry.node.code, entry])), [index]);

  const select = (id: number) => {
    const entry = index.get(id);
    if (!entry) return;
    setSelectedId(id);
    setExpanded((current) => new Set([...current, ...entry.ancestors]));
  };

  if (!scheme) {
    return (
      <main className="admin-pagina">
        <p className="admin-cargando">{error ?? 'Cargando esquema…'}</p>
      </main>
    );
  }

  const editable = !scheme.published_at;
  const structureLocked = [...index.values()].some((entry) => entry.node.range);
  const steps = stepsFor(scheme, mapReport);
  const ready = scheme.status === 'ASSIGNED' && Boolean(mapReport?.publishable);
  const levelNames = [...new Set([...index.values()].map((entry) => entry.node.level_name))];
  const requiredLevels = new Set([...index.values()].filter((e) => e.node.range_required).map((e) => e.node.level_name));
  const minimum = requiredLevels.size === 1 ? [...requiredLevels][0] : requiredLevels.size === 0 ? '' : 'varios';

  const copy = async () => {
    const copySaved = await api.copyScheme(schemeId);
    navigate(`/admin/esquemas/${copySaved.scheme_id}`);
  };

  return (
    <main className="admin-pagina admin-esquema">
      <nav className="migas" aria-label="Ruta">
        <Link to="/admin">Esquemas</Link>
        <span aria-hidden="true"> / </span>
        <span>{scheme.name}</span>
      </nav>

      <div className="admin-cabecera">
        <div>
          <h1 className="titulo admin-titulo">{scheme.name}</h1>
          <p className="esquema-resumen">{statusText(scheme)}</p>
          {scheme.short_description && <p className="esquema-descripcion">{scheme.short_description}</p>}
        </div>
        <div className="esquema-acciones-principales">
          {!scheme.published_at && (
            <>
              {!ready && <span className="acciones-nota">Complete los pasos para publicar</span>}
              <button type="button" className="boton-principal" disabled={!ready} onClick={() => void run(() => api.publishScheme(schemeId).then(() => undefined))}>
                Publicar
              </button>
            </>
          )}
          {scheme.published_at && !scheme.is_active && (
            <>
              <button type="button" className="boton-secundario" onClick={() => void run(() => api.unpublishScheme(schemeId).then(() => undefined))}>
                Despublicar
              </button>
              <button type="button" className="boton-principal" onClick={() => activateDialog.current?.showModal()}>
                Activar
              </button>
            </>
          )}
          {scheme.published_at && (
            <button type="button" className="boton-secundario" onClick={() => void copy()}>
              Copiar para editar
            </button>
          )}
        </div>
      </div>

      {scheme.published_at && (
        <p className="aviso-publicado" role="status">
          {scheme.is_active
            ? 'Este esquema está en uso en la búsqueda pública y no se puede editar. Para hacer cambios, cópielo.'
            : 'Este esquema está publicado y no se puede editar. Para hacer cambios, cópielo o despublíquelo.'}
        </p>
      )}

      <SchemeSteps
        steps={steps}
        onGo={(nextTab, focusCode) => {
          setTab(nextTab);
          const entry = focusCode ? byCode.get(focusCode) : undefined;
          if (entry) select(entry.node.location_id);
        }}
      />

      {error && (
        <p className="admin-error" role="alert">
          {error}
          <button type="button" className="boton-texto" onClick={() => setError(null)}>
            Cerrar
          </button>
        </p>
      )}

      <div className="pestanas" role="tablist" aria-label="Secciones del esquema">
        {(['ubicaciones', 'plano'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'pestana pestana-activa' : 'pestana'}
            onClick={() => setTab(name)}
          >
            {name === 'ubicaciones' ? 'Ubicaciones y rangos' : 'Plano'}
          </button>
        ))}
      </div>

      {tab === 'ubicaciones' ? (
        <div className="ubicaciones">
          <div className="arbol-columna">
            <label className="minimo">
              Mínimo para publicar
              <select
                value={minimum}
                disabled={!editable}
                onChange={(event) => void run(() => api.setMinimumLevel(schemeId, event.target.value))}
              >
                <option value="">Sin definir</option>
                {minimum === 'varios' && <option value="varios">Varios niveles</option>}
                {levelNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {scheme.locations.length > 0 ? (
              <LocationTree
                nodes={scheme.locations}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onSelect={(node) => select(node.location_id)}
              />
            ) : (
              <p className="arbol-vacio">Todavía no hay ubicaciones. Empiece por las de primer nivel, por ejemplo las filas.</p>
            )}
            {addingRoot ? (
              <AddLocationForm
                parent={null}
                onCancel={() => setAddingRoot(false)}
                onAdd={async (name, levelName) => {
                  if (await run(() => api.createLocation(schemeId, { parent_location_id: null, name, level_name: levelName }))) {
                    setAddingRoot(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="boton-secundario arbol-agregar"
                disabled={!editable || structureLocked}
                onClick={() => setAddingRoot(true)}
              >
                Agregar ubicación principal
              </button>
            )}
          </div>

          <div className="detalle-columna">
            {selected ? (
              <LocationPanel
                key={selected.node.location_id}
                schemeId={schemeId}
                node={selected.node}
                siblings={selected.siblings}
                editable={editable}
                structureLocked={structureLocked}
                run={run}
                reload={reload}
                onDeleted={() => setSelectedId(null)}
              />
            ) : (
              <p className="detalle-vacio">Elija una ubicación del árbol para ver sus datos y cargar sus rangos.</p>
            )}
          </div>
        </div>
      ) : (
        <MapTab
          schemeId={schemeId}
          schemeName={scheme.name}
          report={mapReport}
          editable={editable}
          selectedCode={selected?.node.code ?? null}
          onSelectCode={(code) => {
            const entry = byCode.get(code);
            if (entry) select(entry.node.location_id);
            return Boolean(entry);
          }}
          run={run}
        />
      )}

      <dialog ref={activateDialog} className="dialogo" aria-labelledby="activar-titulo">
        <h2 id="activar-titulo">¿Activar «{scheme.name}»?</h2>
        <p>La búsqueda pública empezará a usar este esquema y dejará de usar el que está en uso ahora.</p>
        <div className="dialogo-acciones">
          <button type="button" className="boton-secundario" onClick={() => activateDialog.current?.close()}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-principal"
            onClick={async () => {
              activateDialog.current?.close();
              await run(() => api.activateScheme(schemeId).then(() => undefined));
            }}
          >
            Activar
          </button>
        </div>
      </dialog>
    </main>
  );
}
