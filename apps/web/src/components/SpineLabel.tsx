import { spineLines } from '../lib/spine.ts';
import './SpineLabel.css';

// La signatura tal como está pegada en el lomo del libro: es lo que la
// persona va a buscar con la vista en el estante.
export function SpineLabel({ code }: { code: string }) {
  const lines = spineLines(code);
  if (!lines) return null;
  return (
    <p className="lomo" aria-label={`Signatura ${code}`}>
      {lines.map((line, index) => (
        <span key={index} className="lomo-linea" aria-hidden="true">
          {line}
        </span>
      ))}
    </p>
  );
}
