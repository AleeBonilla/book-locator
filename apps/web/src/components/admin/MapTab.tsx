import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/admin-format.ts';
import type { MapReport } from '../../lib/admin-types.ts';
import { ApiError } from '../../lib/api-types.ts';
import * as api from '../../lib/mock-admin.ts';
import { sanitizeMap } from '../../lib/sanitize-map.ts';
import { MapCanvas, type MapHighlight } from '../MapCanvas.tsx';

interface Props {
  schemeId: number;
  schemeName: string;
  report: MapReport | null;
  editable: boolean;
  selectedCode: string | null;
  // Devuelve false si el código no corresponde a ninguna ubicación.
  onSelectCode: (code: string) => boolean;
  run: (change: () => Promise<void>) => Promise<boolean>;
}

const NO_INSETS = () => ({ left: 0, bottom: 0 });

// Plano del esquema: vista interactiva, reporte de etiquetas, subida y hoja
// de códigos para quien lo diseña.
export function MapTab({ schemeId, schemeName, report, editable, selectedCode, onSelectCode, run }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [checked, setChecked] = useState<{ file: string; report: MapReport } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  // Figura sin ubicación (código inexistente) señalada desde el reporte.
  const [orphan, setOrphan] = useState<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const checkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.getMap(schemeId).then((map) => setSvg(map ? sanitizeMap(map) : null));
  }, [schemeId, report]);

  // Al elegir una ubicación (en el árbol o en el plano), el plano la encuadra.
  const [shownCode, setShownCode] = useState(selectedCode);
  if (shownCode !== selectedCode) {
    setShownCode(selectedCode);
    setFocusKey((key) => key + 1);
  }

  const highlights = useMemo<MapHighlight[]>(
    () => [
      ...(selectedCode ? [{ code: selectedCode, kind: 'selected' as const }] : []),
      ...(orphan ? [{ code: orphan, kind: 'neighbor' as const }] : []),
    ],
    [selectedCode, orphan],
  );

  // Desde el reporte: una ubicación existente se selecciona; una figura
  // huérfana se señala en el plano.
  const point = (code: string) => {
    if (onSelectCode(code)) {
      setOrphan(null);
    } else {
      setOrphan(code);
      setFocusKey((key) => key + 1);
    }
  };

  const readFile = (input: HTMLInputElement | null) => input?.files?.[0]?.text() ?? Promise.resolve(null);

  const upload = async () => {
    const text = await readFile(uploadInput.current);
    if (text !== null) await run(() => api.uploadMap(schemeId, text, true).then(() => undefined));
    if (uploadInput.current) uploadInput.current.value = '';
  };

  const check = async () => {
    const file = checkInput.current?.files?.[0];
    const text = await readFile(checkInput.current);
    if (!file || text === null) return;
    setCheckError(null);
    try {
      setChecked({ file: file.name, report: await api.uploadMap(schemeId, text, false) });
    } catch (error) {
      setChecked(null);
      setCheckError(error instanceof ApiError ? error.message : 'No se pudo validar el archivo');
    }
    if (checkInput.current) checkInput.current.value = '';
  };

  const downloadSheet = async () => {
    downloadText(await api.codeSheetCsv(schemeId), `codigos-${schemeName}.csv`, 'text/csv;charset=utf-8');
  };

  return (
    <div className="plano">
      <div className="plano-lienzo">
        {svg ? (
          <MapCanvas
            svg={svg}
            highlights={highlights}
            getInsets={NO_INSETS}
            focusKey={focusKey}
            onFigureClick={point}
          />
        ) : (
          <div className="plano-vacio">
            <p className="plano-vacio-titulo">Este esquema todavía no tiene plano.</p>
            <p>
              Descargue la hoja de códigos y envíela a quien diseña el plano, junto con la guía. Cuando tenga el archivo
              SVG, súbalo aquí.
            </p>
          </div>
        )}
      </div>

      <aside className="plano-panel">
        <div className="plano-acciones">
          <input ref={uploadInput} type="file" accept=".svg,image/svg+xml" hidden onChange={() => void upload()} />
          <input ref={checkInput} type="file" accept=".svg,image/svg+xml" hidden onChange={() => void check()} />
          <button type="button" className="boton-principal" disabled={!editable} onClick={() => uploadInput.current?.click()}>
            {report ? 'Reemplazar plano' : 'Subir plano'}
          </button>
          <button type="button" className="boton-secundario" onClick={() => checkInput.current?.click()}>
            Validar sin guardar
          </button>
          <button type="button" className="boton-texto" onClick={() => void downloadSheet()}>
            Descargar hoja de códigos
          </button>
        </div>

        {checkError && <p className="plano-error">{checkError}</p>}
        {checked && (
          <section className="reporte reporte-prueba" aria-label={`Validación de ${checked.file}`}>
            <h3>Validación de {checked.file}</h3>
            <ReportBody report={checked.report} onSelectCode={point} />
            <button type="button" className="boton-texto" onClick={() => setChecked(null)}>
              Cerrar
            </button>
          </section>
        )}

        {report && (
          <section className="reporte" aria-label="Plano guardado">
            <h3>Plano guardado</h3>
            <ReportBody report={report} onSelectCode={point} />
          </section>
        )}

        {svg && <p className="plano-ayuda">Haga clic en una figura del plano para ver su ubicación.</p>}
      </aside>
    </div>
  );
}

function ReportBody({ report, onSelectCode }: { report: MapReport; onSelectCode: (code: string) => void }) {
  const problems = [
    ...report.missing_required.map((item) => ({ code: item.code, text: `Falta dibujar ${item.name} (${item.code})` })),
    ...report.unknown_codes.map((item) => ({ code: item.code, text: `La figura loc-${item.code} no corresponde a ninguna ubicación` })),
    ...report.malformed_labels.map((item) => ({ code: null, text: `Etiqueta mal escrita: ${item.id}` })),
  ];
  return (
    <>
      <p className="reporte-resumen">
        {report.labels} figuras etiquetadas.{' '}
        {report.publishable ? 'Cumple los requisitos para publicar.' : `${problems.length} por corregir antes de publicar.`}
      </p>
      {problems.length > 0 && (
        <ul className="reporte-lista">
          {problems.slice(0, 12).map((problem, index) => (
            <li key={index}>
              {problem.code ? (
                <button type="button" className="boton-texto" onClick={() => onSelectCode(problem.code!)}>
                  {problem.text}
                </button>
              ) : (
                problem.text
              )}
            </li>
          ))}
          {problems.length > 12 && <li>Y {problems.length - 12} más.</li>}
        </ul>
      )}
    </>
  );
}
