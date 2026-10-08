import { useRef, useState } from 'react';
import type { LocationNode } from '../../lib/admin-types.ts';
import * as api from '../../lib/mock-admin.ts';
import { autoName, hasOwnName, positionAmong, renumber, type TemplateNode } from '../../lib/structure.ts';
import { RangeRow } from './RangeRow.tsx';
import { AddLocationsForm } from './StructureBuilder.tsx';

// Ejecuta un cambio, muestra su error si falla y recarga el esquema.
type Run = (change: () => Promise<void>) => Promise<boolean>;

function PanelHeader({ node, path }: { node: LocationNode; path: string[] }) {
  return (
    <header className="ubicacion-cabecera">
      {path.length > 0 && <p className="ubicacion-ruta">{path.join(' › ')}</p>}
      <h2 id="ubicacion-titulo">{node.name}</h2>
      <span className="ubicacion-codigo">
        {node.level_name} · código {node.code}
      </span>
    </header>
  );
}

// Sección Estructura: nombre de la ubicación y cambios en el árbol. Agregar,
// mover y eliminar solo aparecen mientras la estructura se puede cambiar.
export function StructurePanel({
  schemeId,
  node,
  path,
  siblings,
  editable,
  structureEditable,
  options,
  required,
  run,
  onDeleted,
}: {
  schemeId: number;
  node: LocationNode;
  // Nombres de sus ancestros, de la raíz hacia abajo.
  path: string[];
  siblings: LocationNode[];
  // El esquema no está publicado: se pueden cambiar nombres.
  editable: boolean;
  // Además no hay rangos: se puede agregar, mover y eliminar (0001 §4).
  structureEditable: boolean;
  // Lo que la estructura prevé dentro de esta ubicación (lib/structure.ts).
  options: TemplateNode[];
  // Niveles que forman el mínimo para publicar: las nuevas se marcan igual.
  required: ReadonlySet<string>;
  run: Run;
  onDeleted: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ownName, setOwnName] = useState(hasOwnName(node, siblings));
  const nameInput = useRef<HTMLInputElement>(null);
  const index = siblings.findIndex((s) => s.location_id === node.location_id);
  const automatic = autoName(node.level_name, positionAmong(node, siblings));
  const childCount = countDescendants(node);

  const saveName = (value: string) => {
    if (value.trim() && value.trim() !== node.name) void run(() => api.updateLocation(node.location_id, { name: value.trim() }));
  };

  // Sin nombre propio, la ubicación vuelve a llamarse como su nivel y número.
  const toggleOwnName = (checked: boolean) => {
    setOwnName(checked);
    if (checked) requestAnimationFrame(() => nameInput.current?.select());
    else if (node.name !== automatic) void run(() => api.updateLocation(node.location_id, { name: automatic }));
  };

  // Mover o eliminar cambia la posición de las hermanas: las de nombre
  // automático se renumeran igual que sus códigos.
  const move = (direction: -1 | 1) => {
    const order = [...siblings];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    void run(async () => {
      await api.moveLocation(node.location_id, direction);
      await api.updateLocations(schemeId, renumber(siblings, order));
    });
  };

  const remove = () =>
    run(async () => {
      await api.deleteLocation(node.location_id);
      await api.updateLocations(schemeId, renumber(siblings, siblings.filter((s) => s.location_id !== node.location_id)));
    });

  return (
    <section className="ubicacion" aria-labelledby="ubicacion-titulo">
      <PanelHeader node={node} path={path} />

      <div className="ubicacion-datos">
        <label>
          Nombre
          <input
            ref={nameInput}
            key={`nombre-${node.location_id}-${node.name}-${ownName}`}
            className="campo"
            defaultValue={ownName ? node.name : automatic}
            disabled={!editable || !ownName}
            onBlur={(event) => saveName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </label>
        <label className="casilla">
          <input type="checkbox" checked={ownName} disabled={!editable} onChange={(event) => toggleOwnName(event.target.checked)} />
          Nombre propio
        </label>
      </div>

      {structureEditable && (
        <>
          <div className="ubicacion-acciones ubicacion-acciones-estructura">
            <button type="button" className="boton-secundario" disabled={adding} onClick={() => setAdding(true)}>
              Agregar dentro
            </button>
            <button type="button" className="boton-secundario" disabled={index <= 0} onClick={() => move(-1)}>
              Subir
            </button>
            <button type="button" className="boton-secundario" disabled={index === siblings.length - 1} onClick={() => move(1)}>
              Bajar
            </button>
            <button type="button" className="boton-peligro" onClick={() => setConfirmDelete(true)}>
              Eliminar
            </button>
          </div>

          {confirmDelete && (
            <div className="confirmar" role="alertdialog" aria-labelledby="confirmar-texto">
              <p id="confirmar-texto">
                ¿Eliminar {node.name}
                {childCount > 0 ? ` y las ${childCount} ubicaciones que contiene` : ''}? Las siguientes se renumeran: cambian
                sus códigos y, si no tienen nombre propio, sus nombres.
              </p>
              <button
                type="button"
                className="boton-peligro"
                onClick={async () => {
                  if (await remove()) onDeleted();
                }}
              >
                Eliminar
              </button>
              <button type="button" className="boton-secundario" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          )}

          {adding && (
            <AddLocationsForm
              parentName={node.name}
              existing={node.children}
              options={options}
              required={required}
              onCancel={() => setAdding(false)}
              onAdd={async (items) => {
                if (await run(() => api.createLocations(schemeId, node.location_id, items))) setAdding(false);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

// Sección Rangos: marca del mínimo y rangos de la ubicación o de sus hijas.
export function RangePanel({
  node,
  path,
  editable,
  run,
  reload,
}: {
  node: LocationNode;
  path: string[];
  editable: boolean;
  run: Run;
  // Vuelve a leer el esquema (después de guardar un rango).
  reload: () => Promise<void>;
}) {
  const allChildrenRanged = node.children.length > 0 && node.children.every((child) => child.range);

  return (
    <section className="ubicacion" aria-labelledby="ubicacion-titulo">
      <PanelHeader node={node} path={path} />

      <label className="casilla ubicacion-minimo">
        <input
          type="checkbox"
          checked={node.range_required}
          disabled={!editable}
          onChange={(event) => void run(() => api.updateLocation(node.location_id, { range_required: event.target.checked }))}
        />
        Forma parte del mínimo para publicar
      </label>

      {node.children.length > 0 ? (
        <>
          <table className="tabla-rangos">
            <thead>
              <tr>
                <th scope="col">Ubicación</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">
                  <span className="visualmente-oculto">Estado</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {node.children.map((child, position) => (
                <RangeRow
                  key={child.location_id}
                  node={child}
                  label={position === 0 && child.level_name === 'Anaquel' ? `${child.name} (arriba)` : child.name}
                  editable={editable}
                  onSave={(start, end) => api.setRange(child.location_id, start, end).then(reload)}
                  onClear={() => api.clearRange(child.location_id).then(reload)}
                />
              ))}
            </tbody>
          </table>
          <p className="ubicacion-nota">
            {allChildrenRanged
              ? `El rango de ${node.name} se calcula de estos: ${node.range!.start} a ${node.range!.end}.`
              : `Cuando todas tengan rango, el de ${node.name} se calculará solo.`}
          </p>
        </>
      ) : (
        <table className="tabla-rangos">
          <tbody>
            <RangeRow
              key={node.location_id}
              node={node}
              label={node.name}
              editable={editable}
              onSave={(start, end) => api.setRange(node.location_id, start, end).then(reload)}
              onClear={() => api.clearRange(node.location_id).then(reload)}
            />
          </tbody>
        </table>
      )}
    </section>
  );
}

function countDescendants(node: LocationNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}
