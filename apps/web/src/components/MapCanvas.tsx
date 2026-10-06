import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import './MapCanvas.css';

export interface MapHighlight {
  code: string;
  kind: 'found' | 'neighbor';
}

// Zona del lienzo tapada por otros elementos (el panel de búsqueda), en px.
// Al encuadrar, el plano se acomoda en el resto.
export interface Insets {
  left: number;
  bottom: number;
}

interface Props {
  svg: string;
  highlights: MapHighlight[];
  // Se consulta en el momento de encuadrar, para usar la medida actual del
  // panel (que crece al mostrar un resultado).
  getInsets: () => Insets;
  // Cambia con cada búsqueda: dispara el encuadre del resultado.
  focusKey: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ZOOM = 12; // el viewBox más chico es el contenido / 12
const MIN_ZOOM = 0.6; // y el más grande, el contenido / 0,6
const ANIMATION_MS = 450;
// Alto de la fila de controles, abajo a la derecha: al encuadrar, la figura
// no debe quedar debajo de ellos.
const CONTROLS_HEIGHT = 64;

// Plano interactivo: se desplaza arrastrando, se acerca con la rueda, con
// dos dedos, con doble clic, con el teclado o con los botones. Se trabaja
// sobre el viewBox del SVG, así el dibujo sigue nítido con cualquier zoom.
export function MapCanvas({ svg, highlights, getInsets, focusKey }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const svgEl = useRef<SVGSVGElement | null>(null);
  const content = useRef<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const view = useRef<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const animation = useRef(0);
  const getInsetsRef = useRef(getInsets);
  useLayoutEffect(() => {
    getInsetsRef.current = getInsets;
  }, [getInsets]);

  const apply = () => {
    const { x, y, w, h } = view.current;
    svgEl.current?.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  };

  // Ajusta una vista a los límites: no alejarse ni acercarse de más, y que el
  // centro no salga del contenido.
  const clamp = useCallback((next: Box): Box => {
    const c = content.current;
    const ratio = next.h / next.w;
    const w = Math.min(Math.max(next.w, c.w / MAX_ZOOM), c.w / MIN_ZOOM);
    const h = w * ratio;
    const cx = Math.min(Math.max(next.x + next.w / 2, c.x), c.x + c.w);
    const cy = Math.min(Math.max(next.y + next.h / 2, c.y), c.y + c.h);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, []);

  const setView = useCallback(
    (next: Box) => {
      cancelAnimationFrame(animation.current);
      view.current = clamp(next);
      apply();
    },
    [clamp],
  );

  const animateTo = useCallback(
    (target: Box) => {
      cancelAnimationFrame(animation.current);
      const to = clamp(target);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        view.current = to;
        apply();
        return;
      }
      const from = { ...view.current };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / ANIMATION_MS, 1);
        const e = 1 - (1 - t) ** 3;
        view.current = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          w: from.w + (to.w - from.w) * e,
          h: from.h + (to.h - from.h) * e,
        };
        apply();
        if (t < 1) animation.current = requestAnimationFrame(step);
      };
      animation.current = requestAnimationFrame(step);
    },
    [clamp],
  );

  // Vista que muestra `box` dentro de la zona libre (sin el panel), con el
  // aspecto del lienzo para que el SVG no se deforme ni deje bandas.
  const viewFor = useCallback((box: Box): Box => {
    const el = viewport.current!;
    const { left, bottom } = getInsetsRef.current();
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const freeW = Math.max(cw - left, cw * 0.4);
    const freeH = Math.max(ch - bottom - CONTROLS_HEIGHT, ch * 0.3);
    // Unidades del SVG por píxel para que la caja entre en la zona libre.
    const scale = Math.max(box.w / freeW, box.h / freeH);
    const w = cw * scale;
    const h = ch * scale;
    // El centro de la caja va al centro de la zona libre.
    const freeCenterX = (cw - freeW) + freeW / 2;
    const freeCenterY = freeH / 2;
    return {
      x: box.x + box.w / 2 - freeCenterX * scale,
      y: box.y + box.h / 2 - freeCenterY * scale,
      w,
      h,
    };
  }, []);

  const fitAll = useCallback(
    (animate: boolean) => {
      const c = content.current;
      const pad = 0.04;
      const target = viewFor({ x: c.x - c.w * pad, y: c.y - c.h * pad, w: c.w * (1 + 2 * pad), h: c.h * (1 + 2 * pad) });
      if (animate) animateTo(target);
      else setView(target);
    },
    [animateTo, setView, viewFor],
  );

  // Caja que abarca las figuras resaltadas, en unidades del SVG.
  const highlightBox = useCallback((): Box | null => {
    const root = svgEl.current;
    if (!root || highlights.length === 0) return null;
    const rootInverse = root.getScreenCTM()?.inverse();
    if (!rootInverse) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { code } of highlights) {
      const figure = root.querySelector<SVGGraphicsElement>(`[id="loc-${CSS.escape(code)}"]`);
      const ctm = figure?.getScreenCTM();
      if (!figure || !ctm) continue;
      const toRoot = rootInverse.multiply(ctm);
      const b = figure.getBBox();
      for (const [px, py] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const p = new DOMPoint(px, py).matrixTransform(toRoot);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [highlights]);

  const focusHighlights = useCallback(() => {
    const box = highlightBox();
    if (!box) return;
    // Se muestra la figura con su entorno (unas 12 veces su tamaño, y nunca
    // menos de un tercio de la sala), para reconocer dónde está.
    const c = content.current;
    const size = Math.max(Math.max(box.w, box.h) * 12, c.w / 3.5);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    animateTo(viewFor({ x: cx - size / 2, y: cy - size / 2, w: size, h: size * 0.62 }));
  }, [animateTo, highlightBox, viewFor]);

  // Inserta el SVG y prepara el lienzo.
  useLayoutEffect(() => {
    const root = host.current?.querySelector('svg') ?? null;
    svgEl.current = root;
    if (!root) return;
    const box = root.viewBox.baseVal;
    content.current =
      box && box.width > 0
        ? { x: box.x, y: box.y, w: box.width, h: box.height }
        : { x: 0, y: 0, w: Number(root.getAttribute('width')) || 1000, h: Number(root.getAttribute('height')) || 600 };
    root.removeAttribute('width');
    root.removeAttribute('height');
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    root.setAttribute('aria-hidden', 'true');
    fitAll(false);
  }, [svg, fitAll]);

  // Al cambiar el tamaño de la ventana, se conserva el centro y la escala.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w === 0 || h === 0 || (w === last.w && h === last.h)) return;
      const v = view.current;
      const scale = v.w / last.w;
      last = { w, h };
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      setView({ x: cx - (w * scale) / 2, y: cy - (h * scale) / 2, w: w * scale, h: h * scale });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setView]);

  // Marca las figuras del resultado y repite el pulso en cada búsqueda.
  useEffect(() => {
    const root = svgEl.current;
    if (!root) return;
    for (const el of root.querySelectorAll('.figura-encontrada, .figura-vecina')) {
      el.classList.remove('figura-encontrada', 'figura-vecina');
    }
    for (const { code, kind } of highlights) {
      const figure = root.querySelector(`[id="loc-${CSS.escape(code)}"]`);
      if (!figure) continue;
      // Se vuelve a agregar al final del grupo para que quede por encima.
      figure.parentNode?.appendChild(figure);
      figure.classList.add(kind === 'found' ? 'figura-encontrada' : 'figura-vecina');
    }
  }, [highlights, svg, focusKey]);

  useEffect(() => {
    if (focusKey > 0) focusHighlights();
  }, [focusKey, focusHighlights]);

  // Punto de la pantalla convertido a coordenadas del SVG.
  const toSvg = (clientX: number, clientY: number) => {
    const el = viewport.current!;
    const r = el.getBoundingClientRect();
    const v = view.current;
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  };

  // Acerca (factor > 1) o aleja manteniendo fijo el punto bajo el cursor.
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number, animate = false) => {
      const el = viewport.current!;
      const r = el.getBoundingClientRect();
      const v = view.current;
      const anchor = toSvg(clientX ?? r.left + r.width / 2, clientY ?? r.top + r.height / 2);
      const w = v.w / factor;
      const h = v.h / factor;
      const next = { x: anchor.x - (anchor.x - v.x) / factor, y: anchor.y - (anchor.y - v.y) / factor, w, h };
      if (animate) animateTo(next);
      else setView(next);
    },
    [animateTo, setView],
  );

  const panBy = (dxPx: number, dyPx: number) => {
    const el = viewport.current!;
    const v = view.current;
    const scale = v.w / el.clientWidth;
    setView({ ...v, x: v.x - dxPx * scale, y: v.y - dyPx * scale });
  };

  // Rueda del mouse (y gesto de pellizco del touchpad, que llega como rueda
  // con ctrlKey). Se registra a mano para poder llamar a preventDefault.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const speed = event.ctrlKey ? 0.01 : 0.0015;
      zoomAt(Math.exp(-event.deltaY * speed), event.clientX, event.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Arrastre con un dedo o el mouse, y pellizco con dos dedos.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    cancelAnimationFrame(animation.current);
    viewport.current?.classList.add('arrastrando');
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 1) {
      panBy(current.x - previous.x, current.y - previous.y);
    } else if (pointers.current.size === 2) {
      const [other] = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(current.x - other.x, current.y - other.y);
      if (before > 0) {
        panBy((current.x - previous.x) / 2, (current.y - previous.y) / 2);
        zoomAt(after / before, (current.x + other.x) / 2, (current.y + other.y) / 2);
      }
    }
    pointers.current.set(event.pointerId, current);
  };
  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) viewport.current?.classList.remove('arrastrando');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = 60;
    const actions: Record<string, () => void> = {
      '+': () => zoomAt(1.4, undefined, undefined, true),
      '=': () => zoomAt(1.4, undefined, undefined, true),
      '-': () => zoomAt(1 / 1.4, undefined, undefined, true),
      '0': () => fitAll(true),
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div
      ref={viewport}
      className="lienzo"
      tabIndex={0}
      role="application"
      aria-roledescription="plano"
      aria-label="Plano de la sala. Arrastre para desplazarse; use + y − para acercar o alejar, y 0 para ver todo."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(event) => {
        if (!(event.target as Element).closest('button')) zoomAt(1.8, event.clientX, event.clientY, true);
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={host} className="lienzo-svg" dangerouslySetInnerHTML={{ __html: svg }} />

      <div className="lienzo-controles" role="toolbar" aria-label="Controles del plano">
        {highlights.length > 0 && (
          <button type="button" className="lienzo-boton lienzo-boton-texto" onClick={focusHighlights}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="10" cy="10" r="2.2" fill="currentColor" />
            </svg>
            Ir al resultado
          </button>
        )}
        <button type="button" className="lienzo-boton" aria-label="Acercar" onClick={() => zoomAt(1.5, undefined, undefined, true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <button type="button" className="lienzo-boton" aria-label="Alejar" onClick={() => zoomAt(1 / 1.5, undefined, undefined, true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10h12" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <button type="button" className="lienzo-boton" aria-label="Ver todo el plano" onClick={() => fitAll(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
