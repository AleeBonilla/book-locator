import { useState, type FormEvent } from 'react';
import type { LocationNode } from '../../lib/admin-types.ts';
import {
  autoName,
  buildLocations,
  cloneTemplate,
  countTemplate,
  MAX_COUNT,
  templateNode,
  templateProblem,
  type NewLocation,
  type TemplateNode,
} from '../../lib/structure.ts';

const formatNumber = (n: number) => n.toLocaleString('es-CR');

// Cambia la lista que contiene el nivel `key` (en cualquier profundidad).
function editTree(
  nodes: TemplateNode[],
  key: number,
  edit: (list: TemplateNode[], index: number) => TemplateNode[],
): TemplateNode[] {
  const index = nodes.findIndex((node) => node.key === key);
  if (index >= 0) return edit(nodes, index);
  return nodes.map((node) => ({ ...node, children: editTree(node.children, key, edit) }));
}

interface Row {
  node: TemplateNode;
  depth: number;
  parentName: string | null;
}

function flatten(nodes: TemplateNode[], depth = 0, parentName: string | null = null): Row[] {
  return nodes.flatMap((node) => [{ node, depth, parentName }, ...flatten(node.children, depth + 1, node.name.trim() || '…')]);
}

// Editor de la estructura: cada renglón es un nivel con su cantidad. «Dentro»
// agrega lo que contiene; «Al lado», otro nivel en el mismo lugar.
function TemplateEditor({
  nodes,
  onChange,
  placeLabel,
}: {
  nodes: TemplateNode[];
  onChange: (nodes: TemplateNode[]) => void;
  // Dónde van los del primer renglón: «en la sala», «en Cara 1».
  placeLabel: string;
}) {
  const [focusKey, setFocusKey] = useState<number | null>(null);

  const insert = (key: number, inside: boolean) => {
    const added = templateNode();
    setFocusKey(added.key);
    onChange(
      editTree(nodes, key, (list, index) =>
        inside
          ? list.map((node, i) => (i === index ? { ...node, children: [...node.children, added] } : node))
          : [...list.slice(0, index + 1), added, ...list.slice(index + 1)],
      ),
    );
  };
  const update = (key: number, patch: Partial<TemplateNode>) =>
    onChange(editTree(nodes, key, (list, index) => list.map((node, i) => (i === index ? { ...node, ...patch } : node))));
  const remove = (key: number) => onChange(editTree(nodes, key, (list, index) => list.filter((_, i) => i !== index)));

  if (nodes.length === 0) {
    return (
      <button
        type="button"
        className="boton-secundario"
        onClick={() => {
          const added = templateNode();
          setFocusKey(added.key);
          onChange([added]);
        }}
      >
        Agregar nivel
      </button>
    );
  }

  return (
    <table className="tabla-niveles">
      <thead>
        <tr>
          <th scope="col">Nivel</th>
          <th scope="col">Cantidad</th>
          <th scope="col">
            <span className="visualmente-oculto">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {flatten(nodes).map(({ node, depth, parentName }, index) => (
          <tr key={node.key}>
            <td className="nivel-nombre" style={{ paddingLeft: depth * 28 }}>
              <input
                className="campo-tabla"
                value={node.name}
                placeholder={index === 0 ? 'Ej.: Fila' : 'Nombre del nivel'}
                maxLength={40}
                autoFocus={node.key === focusKey}
                aria-label={parentName ? `Nivel dentro de ${parentName}` : 'Nivel'}
                onChange={(event) => update(node.key, { name: event.target.value })}
              />
            </td>
            <td>
              <span className="nivel-cantidad">
                <input
                  type="number"
                  className="campo-tabla campo-numero"
                  min={1}
                  max={MAX_COUNT}
                  value={Number.isNaN(node.count) ? '' : node.count}
                  aria-label={`Cantidad de ${node.name.trim() || 'este nivel'}`}
                  onChange={(event) => update(node.key, { count: event.target.valueAsNumber })}
                />
                <span>{parentName ? `por ${parentName}` : placeLabel}</span>
              </span>
            </td>
            <td className="nivel-acciones">
              <button type="button" className="boton-texto" onClick={() => insert(node.key, true)}>
                Dentro
              </button>
              <button type="button" className="boton-texto" onClick={() => insert(node.key, false)}>
                Al lado
              </button>
              <button type="button" className="boton-texto" onClick={() => remove(node.key)}>
                Quitar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Primera ruta de la estructura con números: «Fila 1 › Cara 1 › Mueble 1».
function examplePath(nodes: TemplateNode[]): string {
  const names: string[] = [];
  for (let node = nodes[0]; node; node = node.children[0]) names.push(autoName(node.name.trim() || '…', 1));
  return names.join(' › ');
}

function totalText(nodes: TemplateNode[]): string {
  const total = countTemplate(nodes);
  if (Number.isNaN(total)) return '';
  return total === 1 ? '1 ubicación' : `${formatNumber(total)} ubicaciones`;
}

// Primer paso de un esquema vacío: se arma la estructura y se crean todas las
// ubicaciones de una vez.
export function StructureBuilder({ onCreate }: { onCreate: (items: NewLocation[]) => Promise<void> }) {
  const [nodes, setNodes] = useState<TemplateNode[]>(() => [templateNode()]);
  const [creating, setCreating] = useState(false);
  const problem = templateProblem(nodes);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setCreating(true);
    await onCreate(buildLocations(nodes, new Set()));
    setCreating(false);
  };

  return (
    <form className="estructura" onSubmit={submit} aria-labelledby="estructura-titulo">
      <h2 id="estructura-titulo">Estructura de la sala</h2>
      <p className="estructura-ayuda">
        Escriba los niveles, del más grande al más pequeño, y cuántos hay.
        <br />
        «Dentro» agrega lo que contiene ese nivel; «Al lado», otro tipo de ubicación en el mismo lugar (p. ej., mesas junto a las filas).
      </p>

      <TemplateEditor nodes={nodes} onChange={setNodes} placeLabel="en la sala" />

      <div className="estructura-acciones">
        <button type="submit" className="boton-principal" disabled={Boolean(problem) || creating}>
          {creating ? 'Creando…' : 'Crear ubicaciones'}
        </button>
        {problem ? (
          <span className="estructura-problema">{problem}</span>
        ) : (
          <span className="estructura-total">
            {totalText(nodes)} · {examplePath(nodes)}
          </span>
        )}
      </div>
    </form>
  );
}

// Agrega ubicaciones dentro de otra (o en la sala), partiendo de lo que la
// estructura prevé en ese lugar.
export function AddLocationsForm({
  parentName,
  existing,
  options,
  required,
  onAdd,
  onCancel,
}: {
  // null: en la sala (primer nivel).
  parentName: string | null;
  // Las que ya hay en ese lugar: las nuevas se numeran a continuación.
  existing: LocationNode[];
  // Lo que la estructura prevé en ese lugar.
  options: TemplateNode[];
  required: ReadonlySet<string>;
  onAdd: (items: NewLocation[]) => Promise<void>;
  onCancel: () => void;
}) {
  const startFrom = (choice: number) =>
    choice < 0 ? [templateNode()] : cloneTemplate([options[choice]]).map((node) => ({ ...node, count: 1 }));
  const [choice, setChoice] = useState(options.length > 0 ? 0 : -1);
  const [nodes, setNodes] = useState<TemplateNode[]>(() => startFrom(choice));
  const [adding, setAdding] = useState(false);
  const problem = templateProblem(nodes);
  const firstNames = problem ? [] : buildLocations(nodes.slice(0, 1), required, existing).map((item) => item.name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setAdding(true);
    await onAdd(buildLocations(nodes, required, existing));
    setAdding(false);
  };

  return (
    <form className="agregar agregar-lote" onSubmit={submit}>
      <p className="agregar-titulo">{parentName ? `Agregar dentro de ${parentName}` : 'Agregar en la sala'}</p>
      {options.length > 0 && (
        <label className="agregar-partir">
          Partir de
          <select
            className="campo"
            value={choice}
            onChange={(event) => {
              const next = Number(event.target.value);
              setChoice(next);
              setNodes(startFrom(next));
            }}
          >
            {options.map((option, index) => (
              <option key={option.key} value={index}>
                {option.name}
              </option>
            ))}
            <option value={-1}>Un nivel nuevo</option>
          </select>
        </label>
      )}

      <TemplateEditor nodes={nodes} onChange={setNodes} placeLabel={parentName ? `en ${parentName}` : 'en la sala'} />

      <div className="agregar-acciones">
        <button type="submit" className="boton-principal" disabled={Boolean(problem) || adding}>
          {adding ? 'Agregando…' : 'Agregar'}
        </button>
        <button type="button" className="boton-secundario" onClick={onCancel}>
          Cancelar
        </button>
        {problem ? (
          <span className="estructura-problema">{problem}</span>
        ) : (
          <span className="estructura-total">
            {totalText(nodes)} · {firstNames.length > 1 ? `${firstNames[0]} a ${firstNames.at(-1)}` : firstNames[0]}
          </span>
        )}
      </div>
    </form>
  );
}

export interface LevelRename {
  from: string;
  to: string;
}

function Outline({ nodes }: { nodes: TemplateNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.key}>
          {node.name} <span className="estructura-cantidad">× {node.count}</span>
          {node.children.length > 0 && <Outline nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

// La estructura de un esquema ya creado (sección Estructura, sin ubicación
// elegida). Renombrar un nivel cambia el nivel
// de todas sus ubicaciones y el nombre de las que no tienen uno propio.
export function StructureSummary({
  template,
  levels,
  editable,
  onRename,
}: {
  template: TemplateNode[];
  levels: string[];
  editable: boolean;
  onRename: (changes: LevelRename[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const names = draft?.map((name) => name.trim()) ?? [];
  const invalid = names.some((name) => !name) || new Set(names).size !== names.length;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const changes = names.flatMap((to, index) => (to !== levels[index] ? [{ from: levels[index], to }] : []));
    if (changes.length === 0 || (await onRename(changes))) setDraft(null);
  };

  return (
    <section className="ubicacion estructura-tarjeta" aria-labelledby="estructura-tarjeta-titulo">
      <h2 id="estructura-tarjeta-titulo">Estructura</h2>
      {draft ? (
        <form className="estructura-renombrar" onSubmit={save}>
          {draft.map((name, index) => (
            <label key={levels[index]} className="renombrar-nivel">
              <span>{levels[index]}</span>
              <input
                className="campo"
                value={name}
                maxLength={40}
                onChange={(event) => setDraft((current) => current!.map((value, i) => (i === index ? event.target.value : value)))}
              />
            </label>
          ))}
          <p className="ubicacion-nota">Cambian también los nombres automáticos: «Fila 3» pasa a «Pasillo 3».</p>
          <div className="agregar-acciones">
            <button type="submit" className="boton-principal" disabled={invalid}>
              Guardar
            </button>
            <button type="button" className="boton-secundario" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <Outline nodes={template} />
          <p className="ubicacion-nota">Elija una ubicación del árbol para cambiar su nombre o lo que contiene.</p>
          {editable && (
            <button type="button" className="boton-texto" onClick={() => setDraft(levels)}>
              Renombrar niveles
            </button>
          )}
        </>
      )}
    </section>
  );
}
