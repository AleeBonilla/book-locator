import DOMPurify from 'dompurify';

// Segunda barrera para el plano (decisión 0006): el backend ya lo validó con
// una lista blanca, y aquí se limpia antes de insertarlo en la página.
//
// DOMPurify descarta <use> por defecto, pero Figma lo usa para dibujar las
// imágenes de fondo dentro de <pattern>. Se permite solo con referencias
// internas (#id), la misma regla del validador del backend.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (node.nodeName.toLowerCase() === 'use' && /href$/i.test(data.attrName) && !data.attrValue.startsWith('#')) {
    data.keepAttr = false;
  }
});

// Se usa el parser HTML de DOMPurify (el predeterminado), el mismo con el que
// innerHTML interpreta el resultado al insertarlo: así lo que se revisa es lo
// mismo que se dibuja. En modo XML (application/xhtml+xml) DOMPurify compara
// los nombres de atributo distinguiendo mayúsculas y descarta, por ejemplo,
// patternContentUnits, y las imágenes de fondo dejan de verse.
export function sanitizeMap(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
  });
}
