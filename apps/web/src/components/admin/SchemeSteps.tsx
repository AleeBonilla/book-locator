import type { Step, Tab } from '../../lib/admin-steps.ts';

// Pasos para publicar, que son también las secciones de la página: cada uno
// abre la suya y dice qué falta.
export function SchemeSteps({
  steps,
  current,
  onGo,
}: {
  steps: Step[];
  current: Tab;
  onGo: (tab: Tab, focusCode?: string) => void;
}) {
  return (
    <ol className="pasos" role="tablist" aria-label="Pasos para publicar">
      {steps.map((step, index) => {
        const classes = ['paso', step.done && 'paso-hecho', step.tab === current && 'paso-actual'].filter(Boolean).join(' ');
        return (
          <li key={step.tab} className={classes} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={step.tab === current}
              onClick={() => onGo(step.tab, step.done ? undefined : step.focusCode)}
            >
              <span className="paso-numero" aria-hidden="true">
                {step.done ? (
                  <svg viewBox="0 0 16 16">
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="paso-texto">
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
