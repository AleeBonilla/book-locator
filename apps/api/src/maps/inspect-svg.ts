import { SaxesParser, type SaxesTagNS } from "saxes";

// Validación de planos SVG (decisión 0006) y lectura de sus etiquetas
// id="loc-<código>" (decisión 0003 §3). No modifica el archivo: informa qué
// no está permitido y en qué línea, para que el diseñador lo corrija.

export const MAX_MAP_BYTES = 5 * 1024 * 1024;

export interface SvgIssue {
  line: number;
  message: string;
}

export interface SvgLabel {
  code: string;
  line: number;
}

export interface SvgInspection {
  // Contenido no permitido o archivo mal formado: el plano se rechaza.
  issues: SvgIssue[];
  // Etiquetas bien formadas, en orden de aparición.
  labels: SvgLabel[];
  // id que empiezan con "loc-" pero no son un código válido (p. ej. "loc-6-1-10 2").
  malformed_labels: { id: string; line: number }[];
  // Códigos etiquetados más de una vez.
  duplicate_labels: string[];
}

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

// Espacios de nombres de metadatos que agregan los editores: sus elementos no
// se dibujan ni se ejecutan.
const METADATA_NAMESPACES = new Set([
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://purl.org/dc/elements/1.1/",
  "http://creativecommons.org/ns#",
  "http://web.resource.org/cc/",
  "http://www.inkscape.org/namespaces/inkscape",
  "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
]);

const ALLOWED_SVG_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "image", "switch", "view",
  "title", "desc", "metadata", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
  "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
  "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge",
  "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotLight", "feTile", "feTurbulence",
]);

// Explicaciones para los rechazos más probables.
const ELEMENT_HINTS: Record<string, string> = {
  script: "los planos no pueden contener código",
  foreignObject:
    "inserta HTML dentro del SVG; algunas herramientas lo generan para efectos como el desenfoque de fondo: quitá ese efecto antes de exportar",
  a: "los planos no pueden contener enlaces",
  animate: "los planos no pueden contener animaciones",
  animateMotion: "los planos no pueden contener animaciones",
  animateTransform: "los planos no pueden contener animaciones",
  set: "los planos no pueden contener animaciones",
};

const LABEL = /^loc-([1-9][0-9]*(?:-[1-9][0-9]*)*)$/;
const SAFE_HREF = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;
const URL_REFERENCE = /url\(\s*['"]?\s*([^)'"\s]*)/gi;
const MAX_ISSUES = 50;

export function inspectSvg(svg: string): SvgInspection {
  const inspection: SvgInspection = { issues: [], labels: [], malformed_labels: [], duplicate_labels: [] };
  const issue = (line: number, message: string) => {
    if (inspection.issues.length < MAX_ISSUES) inspection.issues.push({ line, message });
  };

  if (Buffer.byteLength(svg, "utf8") > MAX_MAP_BYTES) {
    issue(0, `El archivo supera el máximo de ${MAX_MAP_BYTES / 1024 / 1024} MB`);
    return inspection;
  }

  const parser = new SaxesParser({ xmlns: true, position: true });
  let sawRoot = false;
  let styleDepth = 0; // > 0 mientras se lee el contenido de un <style>
  let styleText = "";
  const seen = new Set<string>();

  parser.on("doctype", () => issue(parser.line, "El archivo no puede tener DOCTYPE"));
  parser.on("processinginstruction", (pi) =>
    issue(parser.line, `Instrucción de procesamiento no permitida: <?${pi.target} …?>`),
  );

  parser.on("opentag", (tag: SaxesTagNS) => {
    const line = parser.line;

    if (!sawRoot) {
      sawRoot = true;
      if (tag.uri !== SVG || tag.local !== "svg") {
        issue(line, "El elemento raíz debe ser <svg>");
      } else if (!Object.values(tag.attributes).some((a) => a.uri === "" && a.local === "viewBox")) {
        issue(line, "El elemento <svg> debe tener el atributo viewBox");
      }
    }

    if (tag.uri === SVG) {
      if (!ALLOWED_SVG_ELEMENTS.has(tag.local)) {
        const hint = ELEMENT_HINTS[tag.local];
        issue(line, `Elemento no permitido: <${tag.local}>${hint ? ` (${hint})` : ""}`);
      }
      if (tag.local === "style") styleDepth++;
    } else if (!METADATA_NAMESPACES.has(tag.uri)) {
      issue(line, `Elemento de otro tipo de documento no permitido: <${tag.name}> (${tag.uri || "sin espacio de nombres"})`);
    }

    for (const attribute of Object.values(tag.attributes)) {
      const { uri, local, value, name } = attribute;

      if (uri === "" && /^on/i.test(local)) {
        issue(line, `Atributo de evento no permitido: ${name}`);
        continue;
      }
      if (local === "href" && (uri === "" || uri === XLINK) && !SAFE_HREF.test(value.trim())) {
        issue(line, `Enlace no permitido en ${name}: solo se aceptan referencias internas (#id) e imágenes incrustadas`);
        continue;
      }
      checkValue(value, line, `el atributo ${name}`, issue);

      if (uri === "" && local === "id" && value.startsWith("loc-")) {
        const match = LABEL.exec(value);
        if (!match) {
          inspection.malformed_labels.push({ id: value, line });
        } else if (seen.has(match[1])) {
          if (!inspection.duplicate_labels.includes(match[1])) inspection.duplicate_labels.push(match[1]);
        } else {
          seen.add(match[1]);
          inspection.labels.push({ code: match[1], line });
        }
      }
    }
  });

  const collectStyle = (text: string) => {
    if (styleDepth > 0) styleText += text;
  };
  parser.on("text", collectStyle);
  parser.on("cdata", collectStyle);
  parser.on("closetag", (tag) => {
    if (tag.uri === SVG && tag.local === "style" && --styleDepth === 0) {
      checkValue(styleText, parser.line, "una hoja de estilos <style>", issue);
      styleText = "";
    }
  });

  try {
    parser.write(svg).close();
  } catch (error) {
    // El primer error de XML detiene la lectura: el resto no es confiable.
    issue(parser.line, `El archivo no es un XML válido: ${(error as Error).message.replace(/^(?:[^:\s]*:)?\d+:\d+:\s*/, "")}`);
  }
  if (!sawRoot && inspection.issues.length === 0) issue(0, "El archivo está vacío");

  return inspection;
}

// Reglas para cualquier valor que el navegador interpreta (atributos y CSS):
// solo referencias internas en url(), sin @import ni javascript:.
function checkValue(value: string, line: number, where: string, issue: (line: number, message: string) => void): void {
  if (/javascript:/i.test(value)) {
    issue(line, `«javascript:» no permitido en ${where}`);
  }
  if (/@import/i.test(value)) {
    issue(line, `@import no permitido en ${where}`);
  }
  for (const [, target] of value.matchAll(URL_REFERENCE)) {
    if (!target.startsWith("#")) {
      issue(line, `url() hacia un recurso externo no permitido en ${where}: solo se aceptan referencias internas (#id)`);
    }
  }
}
