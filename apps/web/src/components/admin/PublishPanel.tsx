import { formatDate } from '../../lib/admin-format.ts';
import type { Step, Tab } from '../../lib/admin-steps.ts';
import type { SchemeDetail } from '../../lib/admin-types.ts';

// Sección Publicación: qué falta para publicar y las acciones del ciclo de
// vida del esquema (publicar, activar, despublicar, copiar).
export function PublishPanel({
  scheme,
  steps,
  onGo,
  onPublish,
  onActivate,
  onUnpublish,
  onCopy,
}: {
  scheme: SchemeDetail;
  steps: Step[];
  onGo: (tab: Tab, focusCode?: string) => void;
  onPublish: () => void;
  onActivate: () => void;
  onUnpublish: () => void;
  onCopy: () => void;
}) {
  const pending = steps.filter((step) => step.tab !== 'publicacion' && !step.done);

  if (scheme.published_at) {
    return (
      <section className="ubicacion publicacion" aria-labelledby="publicacion-titulo">
        <h2 id="publicacion-titulo">{scheme.is_active ? 'En uso' : 'Publicado'}</h2>
        <p>
          {scheme.is_active
            ? 'La búsqueda pública usa este esquema. No se puede editar ni despublicar; para hacer cambios, cópielo.'
            : `Publicado el ${formatDate(scheme.published_at)}. La búsqueda pública todavía no lo usa: actívelo para que lo use.`}
        </p>
        <div className="publicacion-acciones">
          {!scheme.is_active && (
            <button type="button" className="boton-principal" onClick={onActivate}>
              Activar
            </button>
          )}
          <button type="button" className="boton-secundario" onClick={onCopy}>
            Copiar para editar
          </button>
          {!scheme.is_active && (
            <button type="button" className="boton-secundario" onClick={onUnpublish}>
              Despublicar
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="ubicacion publicacion" aria-labelledby="publicacion-titulo">
      <h2 id="publicacion-titulo">{pending.length === 0 ? 'Listo para publicar' : 'Antes de publicar'}</h2>
      {pending.length === 0 ? (
        <p>Al publicar, el esquema queda fijo. Para cambiarlo después habrá que despublicarlo o trabajar sobre una copia.</p>
      ) : (
        <ul className="publicacion-pendientes">
          {pending.map((step) => (
            <li key={step.tab}>
              <span>
                <strong>{step.title}:</strong> {step.detail}
              </span>
              <button type="button" className="boton-texto" onClick={() => onGo(step.tab, step.focusCode)}>
                Ir a {step.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="publicacion-acciones">
        <button type="button" className="boton-principal" disabled={pending.length > 0} onClick={onPublish}>
          Publicar
        </button>
      </div>
    </section>
  );
}
