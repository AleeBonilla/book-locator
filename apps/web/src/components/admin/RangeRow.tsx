import { useState, type FocusEvent } from 'react';
import { ApiError } from '../../lib/api-types.ts';
import type { LocationNode } from '../../lib/admin-types.ts';
import { validateCode } from '../../lib/admin-api.ts';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

interface Props {
  node: LocationNode;
  label: string;
  editable: boolean;
  onSave: (start: string, end: string) => Promise<void>;
  onClear: () => Promise<void>;
}

// Inicio y fin del rango de una ubicación. Cada código se valida al salir del
// campo; cuando los dos son válidos, el rango se guarda solo al salir de la
// fila, para poder cargar un mueble entero con Tab.
export function RangeRow({ node, label, editable, onSave, onClear }: Props) {
  const [start, setStart] = useState(node.range?.start ?? '');
  const [end, setEnd] = useState(node.range?.end ?? '');
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const derived = node.children.length > 0 && node.children.every((child) => child.range);
  if (derived) {
    return (
      <tr className="rango-fila rango-calculado">
        <th scope="row">{label}</th>
        <td colSpan={2}>
          {node.range!.start} <span className="rango-a">a</span> {node.range!.end}
        </td>
        <td className="rango-nota">Calculado de sus {node.children.length} ubicaciones</td>
      </tr>
    );
  }

  const check = (field: 'start' | 'end', value: string) => {
    const reason = value.trim() ? validateCode(value) : null;
    setErrors((current) => ({ ...current, [field]: reason ?? undefined }));
    return reason;
  };

  // Al salir de la fila (no de un campo a otro dentro de ella), se guarda.
  const onRowBlur = async (event: FocusEvent<HTMLTableRowElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const unchanged = start === (node.range?.start ?? '') && end === (node.range?.end ?? '');
    if (unchanged || !start.trim() || !end.trim()) return;
    if (check('start', start) || check('end', end)) return;
    setStatus({ kind: 'saving' });
    try {
      await onSave(start.trim(), end.trim());
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof ApiError ? error.message : 'No se pudo guardar el rango' });
    }
  };

  const clear = async () => {
    setStatus({ kind: 'saving' });
    try {
      await onClear();
      setStart('');
      setEnd('');
      setStatus({ kind: 'idle' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof ApiError ? error.message : 'No se pudo quitar el rango' });
    }
  };

  const message = errors.start ?? errors.end ?? (status.kind === 'error' ? status.message : null);

  return (
    <tr className="rango-fila" onBlur={onRowBlur}>
      <th scope="row">{label}</th>
      <td>
        <input
          className={errors.start ? 'campo-tabla campo-error' : 'campo-tabla'}
          value={start}
          onChange={(event) => setStart(event.target.value)}
          onBlur={(event) => check('start', event.target.value)}
          disabled={!editable}
          aria-label={`Inicio del rango de ${node.name}`}
          placeholder="Inicio"
          aria-invalid={Boolean(errors.start)}
          spellCheck={false}
          autoComplete="off"
        />
      </td>
      <td>
        <input
          className={errors.end ? 'campo-tabla campo-error' : 'campo-tabla'}
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          onBlur={(event) => check('end', event.target.value)}
          disabled={!editable}
          aria-label={`Fin del rango de ${node.name}`}
          placeholder="Fin"
          aria-invalid={Boolean(errors.end)}
          spellCheck={false}
          autoComplete="off"
        />
      </td>
      <td className="rango-nota" aria-live="polite">
        {message ? (
          <span className="rango-error">{message}</span>
        ) : status.kind === 'saving' ? (
          'Guardando…'
        ) : status.kind === 'saved' ? (
          <span className="rango-guardado">Guardado</span>
        ) : (
          node.range &&
          editable && (
            <button type="button" className="boton-texto" onClick={() => void clear()}>
              Quitar
            </button>
          )
        )}
      </td>
    </tr>
  );
}
