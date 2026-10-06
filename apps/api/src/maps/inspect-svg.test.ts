import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inspectSvg, MAX_MAP_BYTES } from "./inspect-svg.js";

const fixtures = new URL("./fixtures/", import.meta.url);
const figmaExport = readFileSync(new URL("figma-plano-ejemplo.svg", fixtures), "utf8");

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">';
const wrap = (body: string) => `${SVG_OPEN}${body}</svg>`;

function messages(svg: string): string[] {
  return inspectSvg(svg).issues.map((issue) => issue.message);
}

describe("exportaciones reales (src/maps/fixtures)", () => {
  // Toda exportación de la colección debe aceptarse (decisión 0006).
  for (const file of readdirSync(fixtures).filter((name) => name.endsWith(".svg"))) {
    it(`acepta ${file}`, () => {
      assert.deepEqual(inspectSvg(readFileSync(new URL(file, fixtures), "utf8")).issues, []);
    });
  }

  it("el export de Figma sin re-etiquetar no tiene etiquetas loc-", () => {
    assert.equal(inspectSvg(figmaExport).labels.length, 0);
  });

  it("re-etiquetado (id=\"4-6-1-10\" → id=\"loc-6-1-10\"), encuentra las 316 figuras", () => {
    const relabeled = figmaExport.replace(/id="\d+-(\d+-\d+-\d+)"/g, 'id="loc-$1"');
    const inspection = inspectSvg(relabeled);
    assert.deepEqual(inspection.issues, []);
    assert.equal(inspection.labels.length, 316);
    assert.deepEqual(inspection.labels[0], { code: "6-1-10", line: 10 });
    assert.deepEqual(inspection.malformed_labels, []);
    assert.deepEqual(inspection.duplicate_labels, []);
  });
});

describe("contenido permitido", () => {
  it("declaración XML, metadatos de Inkscape y atributos de otros espacios de nombres", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"
     viewBox="0 0 10 10">
  <sodipodi:namedview inkscape:zoom="1"/>
  <metadata><rdf:RDF><dc:title>Plano</dc:title></rdf:RDF></metadata>
  <rect id="loc-1-1" inkscape:label="Mueble 1" width="5" height="5"/>
</svg>`;
    assert.deepEqual(messages(svg), []);
  });

  it("filtros, gradientes, máscaras, textos y CSS con referencias internas", () => {
    const svg = wrap(`
      <defs>
        <linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>
        <filter id="f"><feGaussianBlur stdDeviation="2"/><feOffset dx="1"/><feBlend in="SourceGraphic"/></filter>
        <mask id="m"><rect width="10" height="10" fill="white"/></mask>
        <style><![CDATA[ .mueble { fill: url(#g); filter: url('#f'); } ]]></style>
      </defs>
      <g mask="url(#m)" style="fill: url(#g)"><text x="1" y="1">Sala <tspan>Norte</tspan></text></g>
      <use xlink:href="#g"/><use href="#g"/>
      <image href="data:image/jpeg;base64,AAAA" width="1" height="1"/>`);
    assert.deepEqual(messages(svg), []);
  });
});

describe("contenido rechazado", () => {
  const cases: [string, string, RegExp][] = [
    ["<script>", wrap("<script>alert(1)</script>"), /Elemento no permitido: <script>/],
    ["<foreignObject>", wrap("<foreignObject><div/></foreignObject>"), /<foreignObject>.*desenfoque de fondo/],
    ["script HTML con otro prefijo", wrap('<h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script>'), /otro tipo de documento.*xhtml/],
    ["elemento sin espacio de nombres", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><x xmlns=""/></svg>', /sin espacio de nombres/],
    ["atributo de evento", wrap('<rect onload="alert(1)"/>'), /Atributo de evento no permitido: onload/],
    ["href con prefijo inventado", wrap('<use xmlns:zz="http://www.w3.org/1999/xlink" zz:href="javascript:alert(1)"/>'), /Enlace no permitido en zz:href/],
    ["href externo", wrap('<image href="https://example.com/a.png"/>'), /Enlace no permitido/],
    ["imagen SVG incrustada", wrap('<image href="data:image/svg+xml;base64,AAAA"/>'), /Enlace no permitido/],
    ["enlace <a>", wrap('<a href="#x"><rect/></a>'), /<a> \(los planos no pueden contener enlaces\)/],
    ["animación que cambia un enlace", wrap('<use href="#a"><set attributeName="href" to="javascript:alert(1)"/></use>'), /<set>/],
    ["url() externa en un atributo", wrap('<rect fill="url(https://example.com/p.svg#x)"/>'), /url\(\) hacia un recurso externo/],
    ["url() externa en style", wrap('<rect style="fill: url(//example.com/x)"/>'), /url\(\) hacia un recurso externo/],
    ["@import en <style>", wrap("<style>@import 'https://example.com/a.css';</style>"), /@import no permitido en una hoja de estilos/],
    ["javascript: en un valor", wrap('<rect class="javascript:x"/>'), /«javascript:» no permitido/],
    ["DOCTYPE", `<!DOCTYPE svg>${wrap("")}`, /DOCTYPE/],
    ["hoja de estilos externa", `<?xml-stylesheet href="https://example.com/a.css"?>${wrap("")}`, /<\?xml-stylesheet/],
    ["raíz que no es <svg>", '<g xmlns="http://www.w3.org/2000/svg"/>', /raíz debe ser <svg>/],
    ["<svg> sin viewBox", '<svg xmlns="http://www.w3.org/2000/svg"/>', /viewBox/],
    ["XML mal formado", wrap("<g><rect/>"), /no es un XML válido/],
    ["archivo vacío", "", /no es un XML válido|vacío/],
  ];

  for (const [name, svg, expected] of cases) {
    it(name, () => {
      const found = messages(svg);
      assert.ok(found.some((message) => expected.test(message)), `mensajes: ${JSON.stringify(found)}`);
    });
  }

  it("informa la línea de cada problema", () => {
    const svg = `${SVG_OPEN}\n<rect/>\n<script>x</script>\n</svg>`;
    assert.equal(inspectSvg(svg).issues[0].line, 3);
  });

  it("rechaza archivos de más de 5 MB sin leerlos", () => {
    const huge = wrap(`<image href="data:image/png;base64,${"A".repeat(MAX_MAP_BYTES)}"/>`);
    assert.match(messages(huge)[0], /supera el máximo de 5 MB/);
  });
});

describe("etiquetas", () => {
  it("separa etiquetas mal formadas y repetidas", () => {
    const inspection = inspectSvg(
      wrap(`
        <rect id="loc-6-1-10"/>
        <rect id="loc-6-1-10 2"/>
        <rect id="loc-06-1"/>
        <rect id="loc-"/>
        <g><rect id="loc-6-1-9"/></g>
        <rect id="Frame 2 5"/>`).replace('<g><rect id="loc-6-1-9"/></g>', '<g><rect id="loc-6-1-9"/><rect id="loc-6-1-9"/></g>'),
    );
    assert.deepEqual(inspection.issues, []);
    assert.deepEqual(inspection.labels.map((label) => label.code), ["6-1-10", "6-1-9"]);
    assert.deepEqual(inspection.malformed_labels.map((label) => label.id), ["loc-6-1-10 2", "loc-06-1", "loc-"]);
    assert.deepEqual(inspection.duplicate_labels, ["6-1-9"]);
  });
});
