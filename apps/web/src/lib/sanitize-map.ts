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

export function sanitizeMap(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    // Se interpreta como XML, igual que en el backend.
    PARSER_MEDIA_TYPE: 'application/xhtml+xml',
  });
}
