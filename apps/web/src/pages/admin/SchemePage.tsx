import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { RangePanel, StructurePanel } from '../../components/admin/LocationPanel.tsx';
import { LocationTree } from '../../components/admin/LocationTree.tsx';
import { MapTab } from '../../components/admin/MapTab.tsx';
import { PublishPanel } from '../../components/admin/PublishPanel.tsx';
import { SchemeSteps } from '../../components/admin/SchemeSteps.tsx';
import { AddLocationsForm, StructureBuilder, StructureSummary } from '../../components/admin/StructureBuilder.tsx';
import { renameLevel, templateInside, templateOf } from '../../lib/structure.ts';
import { firstPending, stepsFor, type Tab } from '../../lib/admin-steps.ts';
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
  // null hasta que carga el esquema.
  const [tab, setTab] = useState<Tab | null>(null);
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
        // Abre en el primer paso sin terminar y se queda ahí aunque el paso
        // se complete (crear la estructura no salta solo a Rangos).
        setTab((open) => open ?? firstPending(stepsFor(detail, report)));
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
    setAddingRoot(false);
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
  const hasRanges = [...index.values()].some((entry) => entry.node.range);
  const structureEditable = editable && !hasRanges;
  const steps = stepsFor(scheme, mapReport);
  const current = tab ?? firstPending(steps);
  const structure = templateOf(scheme.locations);
  const path = selected ? selected.ancestors.map((id) => index.get(id)!.node) : [];
  const pathNames = path.map((node) => node.name);
  // Lo que la estructura prevé dentro de la ubicación elegida, según los
  // niveles de su ruta.
  const inside = selected ? templateInside(structure, [...path.map((node) => node.level_name), selected.node.level_name]) : [];
  const levelNames = [...new Set([...index.values()].map((entry) => entry.node.level_name))];
  const requiredLevels = new Set([...index.values()].filter((e) => e.node.range_required).map((e) => e.node.level_name));
  const minimum = requiredLevels.size === 1 ? [...requiredLevels][0] : requiredLevels.size === 0 ? '' : 'varios';

  const go = (nextTab: Tab, focusCode?: string) => {
    setTab(nextTab);
    setAddingRoot(false);
    const entry = focusCode ? byCode.get(focusCode) : undefined;
    if (entry) select(entry.node.location_id);
  };

  const copy = async () => {
    const copySaved = await api.copyScheme(schemeId);
    setTab(null);
    navigate(`/admin/esquemas/${copySaved.scheme_id}`);
  };

  const tree = (showRanges: boolean) => (
    <LocationTree
      nodes={scheme.locations}
      selectedId={selectedId}
      expanded={expanded}
      showRanges={showRanges}
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
  );

  return (
    <main className="admin-pagina admin-esquema">
      <nav className="migas" aria-label="Ruta">
        <Link to="/admin">Esquemas</Link>
        <span aria-hidden="true"> / </span>
        <span>{scheme.name}</span>
      </nav>

      <header className="admin-cabecera">
        <h1 className="titulo admin-titulo">{scheme.name}</h1>
        <p className="esquema-resumen">{statusText(scheme)}</p>
        {scheme.short_description && <p className="esquema-descripcion">{scheme.short_description}</p>}
      </header>

      {scheme.published_at && (
        <p className="aviso-publicado" role="status">
          {scheme.is_active
            ? 'Este esquema está en uso en la búsqueda pública y no se puede editar.'
            : 'Este esquema está publicado y no se puede editar.'}{' '}
          <button type="button" className="boton-texto" onClick={() => void copy()}>
            Copiar para editar
          </button>
        </p>
      )}

      <SchemeSteps steps={steps} current={current} onGo={go} />

      {error && (
        <p className="admin-error" role="alert">
          {error}
          <button type="button" className="boton-texto" onClick={() => setError(null)}>
            Cerrar
          </button>
        </p>
      )}

      <div className="seccion" role="tabpanel">
        {current === 'estructura' &&
          (scheme.locations.length === 0 ? (
            editable ? (
              <StructureBuilder onCreate={async (items) => void (await run(() => api.createLocations(schemeId, null, items)))} />
            ) : (
              <p className="detalle-vacio">Este esquema no tiene ubicaciones.</p>
            )
          ) : (
            <>
              {editable && hasRanges && (
                <p className="seccion-aviso">
                  Mientras haya rangos asignados solo se pueden cambiar nombres. Para agregar, mover o eliminar ubicaciones,
                  quite los rangos o trabaje sobre una copia.
                </p>
              )}
              <div className="ubicaciones">
                <div className="arbol-columna">
                  {tree(false)}
                  {structureEditable && (
                    <button type="button" className="boton-secundario arbol-agregar" disabled={addingRoot} onClick={() => setAddingRoot(true)}>
                      Agregar en la sala
                    </button>
                  )}
                </div>
                <div className="detalle-columna">
                  {addingRoot ? (
                    <AddLocationsForm
                      parentName={null}
                      existing={scheme.locations}
                      options={structure}
                      required={requiredLevels}
                      onCancel={() => setAddingRoot(false)}
                      onAdd={async (items) => {
                        if (await run(() => api.createLocations(schemeId, null, items))) setAddingRoot(false);
                      }}
                    />
                  ) : selected ? (
                    <>
                      <button type="button" className="boton-texto detalle-volver" onClick={() => setSelectedId(null)}>
                        Ver la estructura completa
                      </button>
                      <StructurePanel
                        key={selected.node.location_id}
                        schemeId={schemeId}
                        node={selected.node}
                        path={pathNames}
                        siblings={selected.siblings}
                        editable={editable}
                        structureEditable={structureEditable}
                        options={inside}
                        required={requiredLevels}
                        run={run}
                        onDeleted={() => setSelectedId(null)}
                      />
                    </>
                  ) : (
                    <StructureSummary
                      template={structure}
                      levels={levelNames}
                      editable={editable}
                      onRename={(changes) =>
                        run(() =>
                          api.updateLocations(
                            schemeId,
                            changes.flatMap(({ from, to }) => renameLevel(scheme.locations, from, to)),
                          ),
                        )
                      }
                    />
                  )}
                </div>
              </div>
            </>
          ))}

        {current === 'rangos' &&
          (scheme.locations.length === 0 ? (
            <p className="detalle-vacio">
              Primero defina la estructura.{' '}
              <button type="button" className="boton-texto" onClick={() => go('estructura')}>
                Ir a Estructura
              </button>
            </p>
          ) : (
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
                {tree(true)}
              </div>
              <div className="detalle-columna">
                {selected ? (
                  <RangePanel
                    key={selected.node.location_id}
                    node={selected.node}
                    path={pathNames}
                    editable={editable}
                    run={run}
                    reload={reload}
                  />
                ) : (
                  <p className="detalle-vacio">Elija una ubicación del árbol para cargar sus rangos.</p>
                )}
              </div>
            </div>
          ))}

        {current === 'plano' && (
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

        {current === 'publicacion' && (
          <PublishPanel
            scheme={scheme}
            steps={steps}
            onGo={go}
            onPublish={() => void run(() => api.publishScheme(schemeId).then(() => undefined))}
            onActivate={() => activateDialog.current?.showModal()}
            onUnpublish={() => void run(() => api.unpublishScheme(schemeId).then(() => undefined))}
            onCopy={() => void copy()}
          />
        )}
      </div>

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
