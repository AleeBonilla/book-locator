import { useEffect, useRef } from 'react';
import type { LocationNode } from '../../lib/admin-types.ts';

interface Props {
  nodes: LocationNode[];
  selectedId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelect: (node: LocationNode) => void;
  // Marca de rango del mínimo y «Faltan N» (sección Rangos).
  showRanges: boolean;
}

// Árbol de ubicaciones con sus códigos. Las del mínimo de asignación llevan
// una marca: con rango o sin rango.
export function LocationTree(props: Props) {
  // Al elegir una ubicación desde fuera del árbol (un paso, el plano), la
  // lista se desplaza hasta ella. Solo la lista: scrollIntoView movería
  // también la página.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const container = list.current;
    const row = container?.querySelector('.arbol-fila-elegida');
    if (!container || !row) return;
    const box = container.getBoundingClientRect();
    const target = row.getBoundingClientRect();
    if (target.top < box.top) container.scrollTop -= box.top - target.top;
    else if (target.bottom > box.bottom) container.scrollTop += target.bottom - box.bottom;
  }, [props.selectedId]);

  return (
    <ul ref={list} className="arbol" role="tree" aria-label="Ubicaciones">
      {props.nodes.map((node) => (
        <TreeItem key={node.location_id} node={node} depth={0} {...props} />
      ))}
    </ul>
  );
}

// Ubicaciones del mínimo sin rango dentro de una rama.
function missingIn(node: LocationNode): number {
  return node.children.reduce((total, child) => total + (child.range_required && !child.range ? 1 : 0) + missingIn(child), 0);
}

function TreeItem({ node, depth, ...props }: Props & { node: LocationNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  const missing = hasChildren ? missingIn(node) : 0;
  const open = props.expanded.has(node.location_id);
  const selected = props.selectedId === node.location_id;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div className={selected ? 'arbol-fila arbol-fila-elegida' : 'arbol-fila'} style={{ paddingLeft: 8 + depth * 18 }}>
        <button
          type="button"
          className="arbol-abrir"
          aria-label={open ? `Contraer ${node.name}` : `Expandir ${node.name}`}
          onClick={() => props.onToggle(node.location_id)}
          disabled={!hasChildren}
          tabIndex={-1}
        >
          {hasChildren && (
            <svg viewBox="0 0 12 12" aria-hidden="true" className={open ? 'abierto' : undefined}>
              <path d="M4 2.5 7.5 6 4 9.5" />
            </svg>
          )}
        </button>
        <button type="button" className="arbol-nombre" onClick={() => props.onSelect(node)}>
          <span>{node.name}</span>
          <span className="arbol-codigo">{node.code}</span>
          {!props.showRanges ? null : node.range_required ? (
            <span className={node.range ? 'arbol-estado con-rango' : 'arbol-estado sin-rango'}>
              {node.range ? 'Con rango' : 'Sin rango'}
            </span>
          ) : (
            missing > 0 && <span className="arbol-estado sin-rango">Faltan {missing}</span>
          )}
        </button>
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeItem key={child.location_id} node={child} depth={depth + 1} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}
