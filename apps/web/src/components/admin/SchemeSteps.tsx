import type { Step, Tab } from '../../lib/admin-steps.ts';

// Pasos para publicar: cada uno lleva a la pestaña (y, si corresponde, a la
// ubicación) donde se resuelve lo que falta.
export function SchemeSteps({ steps, onGo }: { steps: Step[]; onGo: (tab: Tab, focusCode?: string) => void }) {
  return (
    <ol className="pasos" aria-label="Pasos para publicar">
      {steps.map((step, index) => (
        <li key={step.title} className={step.done ? 'paso paso-hecho' : 'paso'}>
          <button type="button" onClick={() => onGo(step.tab, step.done ? undefined : step.focusCode)}>
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
      ))}
    </ol>
  );
}
