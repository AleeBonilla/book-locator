// Frente del mueble con sus anaqueles; los indicados, marcados. En un mueble,
// la posición 1 es el anaquel superior (decisión 0001 §3).
export function ShelfDiagram({ positions, total }: { positions: number[]; total: number }) {
  const shelf = 9;
  const gap = 5;
  const width = 44;
  const height = total * shelf + (total + 1) * gap;
  return (
    <svg className="mueble" viewBox={`0 0 ${width + 4} ${height + 4}`} width={width + 4} height={height + 4} aria-hidden="true">
      <rect className="mueble-marco" x="1" y="1" width={width + 2} height={height + 2} />
      {Array.from({ length: total }, (_, index) => (
        <rect
          key={index}
          x="6"
          y={2 + gap + index * (shelf + gap)}
          width={width - 8}
          height={shelf}
          className={positions.includes(index + 1) ? 'mueble-anaquel mueble-anaquel-buscado' : 'mueble-anaquel'}
        />
      ))}
    </svg>
  );
}
