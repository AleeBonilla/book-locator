import { useState, type FormEvent } from 'react';
import type { LocationNode } from '../../lib/admin-types.ts';
import * as api from '../../lib/mock-admin.ts';
import { RangeRow } from './RangeRow.tsx';

interface Props {
  schemeId: number;
  node: LocationNode;
  siblings: LocationNode[];
  // El esquema no está publicado.
  editable: boolean;
  // Alguna ubicación tiene rango: la estructura está fija (decisión 0001 §4).
  structureLocked: boolean;
  // Ejecuta un cambio, muestra su error si falla y recarga el esquema.
  run: (change: () => Promise<void>) => Promise<boolean>;
  // Vuelve a leer el esquema (después de guardar un rango).
  reload: () => Promise<void>;
  onDeleted: () => void;
}

// Detalle de la ubicación elegida: datos, estructura y rangos.
export function LocationPanel({ schemeId, node, siblings, editable, structureLocked, run, reload, onDeleted }: Props) {
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const index = siblings.findIndex((s) => s.location_id === node.location_id);
  const canEditStructure = editable && !structureLocked;
  const structureReason = !editable
    ? 'El esquema está publicado.'
    : structureLocked
      ? 'La estructura no se puede cambiar mientras haya rangos asignados.'
      : null;

  const saveField = (field: 'name' | 'level_name', value: string) => {
    const current = field === 'name' ? node.name : node.level_name;
    if (value.trim() && value.trim() !== current) void run(() => api.updateLocation(node.location_id, { [field]: value.trim() }));
  };

  const childCount = countDescendants(node);
  const allChildrenRanged = node.children.length > 0 && node.children.every((child) => child.range);

  return (
    <section className="ubicacion" aria-labelledby="ubicacion-titulo">
      <header className="ubicacion-cabecera">
        <h2 id="ubicacion-titulo">{node.name}</h2>
        <span className="ubicacion-codigo">{node.code}</span>
      </header>

      <div className="ubicacion-datos">
        <label>
          Nombre
          <input
            key={`nombre-${node.location_id}-${node.name}`}
            className="campo"
            defaultValue={node.name}
            disabled={!editable}
            onBlur={(event) => saveField('name', event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </label>
        <label>
          Nivel
          <input
            key={`nivel-${node.location_id}-${node.level_name}`}
            className="campo"
            defaultValue={node.level_name}
            disabled={!editable}
            onBlur={(event) => saveField('level_name', event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={node.range_required}
            disabled={!editable}
            onChange={(event) => void run(() => api.updateLocation(node.location_id, { range_required: event.target.checked }))}
          />
          Forma parte del mínimo para publicar
        </label>
      </div>

      <h3 className="ubicacion-subtitulo">Rangos</h3>
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

      <h3 className="ubicacion-subtitulo">Estructura</h3>
      {structureReason && <p className="ubicacion-nota">{structureReason}</p>}
      <div className="ubicacion-acciones">
        <button type="button" className="boton-secundario" disabled={!canEditStructure} onClick={() => setAdding(true)}>
          Agregar ubicación dentro
        </button>
        <button
          type="button"
          className="boton-secundario"
          disabled={!canEditStructure || index <= 0}
          onClick={() => void run(() => api.moveLocation(node.location_id, -1))}
        >
          Subir
        </button>
        <button
          type="button"
          className="boton-secundario"
          disabled={!canEditStructure || index === siblings.length - 1}
          onClick={() => void run(() => api.moveLocation(node.location_id, 1))}
        >
          Bajar
        </button>
        <button type="button" className="boton-peligro" disabled={!canEditStructure} onClick={() => setConfirmDelete(true)}>
          Eliminar
        </button>
      </div>

      {confirmDelete && (
        <div className="confirmar" role="alertdialog" aria-labelledby="confirmar-texto">
          <p id="confirmar-texto">
            ¿Eliminar {node.name}
            {childCount > 0 ? ` y las ${childCount} ubicaciones que contiene` : ''}? Los códigos de las ubicaciones siguientes
            se renumeran.
          </p>
          <button
            type="button"
            className="boton-peligro"
            onClick={async () => {
              if (await run(() => api.deleteLocation(node.location_id))) onDeleted();
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
        <AddLocationForm
          parent={node}
          onCancel={() => setAdding(false)}
          onAdd={async (name, levelName) => {
            if (await run(() => api.createLocation(schemeId, { parent_location_id: node.location_id, name, level_name: levelName }))) {
              setAdding(false);
            }
          }}
        />
      )}
    </section>
  );
}

export function AddLocationForm({
  parent,
  onAdd,
  onCancel,
}: {
  parent: LocationNode | null;
  onAdd: (name: string, levelName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const suggestedLevel = parent?.children[0]?.level_name ?? '';
  const [name, setName] = useState('');
  const [levelName, setLevelName] = useState(suggestedLevel);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && levelName.trim()) void onAdd(name.trim(), levelName.trim());
  };
  return (
    <form className="agregar" onSubmit={submit}>
      <p className="agregar-titulo">{parent ? `Nueva ubicación dentro de ${parent.name}` : 'Nueva ubicación principal'}</p>
      <label>
        Nombre
        <input className="campo" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <label>
        Nivel
        <input className="campo" value={levelName} onChange={(event) => setLevelName(event.target.value)} placeholder="Mueble" />
      </label>
      <div className="agregar-acciones">
        <button type="submit" className="boton-principal" disabled={!name.trim() || !levelName.trim()}>
          Agregar
        </button>
        <button type="button" className="boton-secundario" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function countDescendants(node: LocationNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}
