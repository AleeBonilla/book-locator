# Decisión: validación del plano SVG con saxes

- **Estado:** Aceptada
- **Fecha:** 2026-10-05

## Contexto

El plano que sube un administrador se guarda en `schemes.map_svg` y la página pública lo inserta en el documento para resaltar figuras. Un SVG puede contener código ejecutable (`<script>`, atributos `onclick`, enlaces `javascript:`, HTML incrustado), así que el backend tiene que validarlo antes de aceptarlo. Además debe leer las etiquetas `id="loc-<código>"` ([decisión 0003 §3](0003-codigos-minimo-y-publicacion.md#3-etiquetado-del-plano)).

Las expresiones regulares no alcanzan. El significado de un elemento o atributo depende del prefijo que declare el propio archivo: con `xmlns:h="http://www.w3.org/1999/xhtml"`, `<h:script>` es un script de HTML, y con `xmlns:zz="http://www.w3.org/1999/xlink"`, `zz:href` es un enlace. Hace falta un parser XML que resuelva los namespaces.

## Decisión

Se usa **[saxes](https://github.com/lddubeau/saxes)** (`saxes@^6`, dependencia de producción; trae `xmlchars`).

- **Estricto.** Cualquier XML mal formado es un error. Un validador no debe tolerar entradas que el navegador podría interpretar de otra forma.
- **Entiende namespaces** (`xmlns: true`). Informa el espacio de nombres real de cada elemento y atributo, sin importar el prefijo.
- **Por eventos.** No arma un árbol en memoria: solo hace falta leer y validar.
- **Sin código nativo.** Funciona igual en Windows, WSL o Linux.
- **Rendimiento.** El plano de ejemplo, de 848 KB, se valida en unos 10 ms.

### Rechazar, no limpiar

Un SVG con contenido no permitido **se rechaza** con un reporte de qué y dónde (línea). No se modifica: lo que se guarda es exactamente el archivo exportado. Así el resultado es predecible y el diseñador sabe qué corregir.

### Lista blanca

| Se acepta | Se rechaza |
|---|---|
| Elementos gráficos del espacio de nombres SVG: formas, grupos, `defs`, `use`, `image`, `pattern`, gradientes, máscaras, recortes, filtros y sus primitivas, textos, `title`, `desc`, `metadata`, `style` | `script`, `foreignObject`, enlaces (`a`), animaciones (`animate`, `set`…, que pueden cambiar un `href` a `javascript:`) y cualquier elemento SVG que no esté en la lista |
| Elementos de metadatos de editores (RDF, Dublin Core, Creative Commons, Inkscape, Sodipodi) | Elementos de cualquier otro espacio de nombres, en particular HTML y MathML |
| Atributos de presentación y atributos de otros espacios de nombres (`inkscape:label`, `serif:id`), que el navegador ignora | Atributos de evento (`on…`) |
| `href` / `xlink:href` hacia `#id` o hacia una imagen `data:image/png`, `jpeg`, `gif` o `webp` | Cualquier otro destino: URLs externas, `javascript:`, `data:image/svg+xml` |
| `url(#id)` en atributos y en CSS | `url(...)` hacia cualquier otro destino, `@import` y `javascript:` en cualquier valor |
| — | `DOCTYPE`, instrucciones de procesamiento (`<?xml-stylesheet …?>`) |

Además, la raíz debe ser `<svg>` con `viewBox`, y el archivo no puede superar los 5 MB.

### Colección de exportaciones reales

`apps/api/src/maps/fixtures/` guarda planos exportados directamente desde las herramientas de diseño, y una prueba exige que todos se acepten. Hoy contiene la exportación de Figma del plano de ejemplo. Cuando un plano real se rechace por algo que resulte inofensivo, se agrega a la lista blanca y el archivo pasa a la colección.

### Defensa en profundidad

La validación del backend no es la única barrera. La página pública debe leer el SVG como XML (`DOMParser` con `image/svg+xml`) y pasarlo por DOMPurify antes de insertarlo.

## Alternativas consideradas

- **@xmldom/xmldom:** también resuelve namespaces y permite modificar y volver a escribir el SVG, pero es permisivo: en la prueba aceptó un `DOCTYPE` con una entidad no definida, con solo un aviso. Sería la opción si se decidiera limpiar en lugar de rechazar.
- **fast-xml-parser:** pensado para leer datos; habría que resolver los namespaces a mano.
- **DOMPurify + jsdom:** limpia en lugar de validar, y jsdom es pesado para esta tarea.
- **libxmljs2:** código nativo, con el problema de binarios entre plataformas, y requiere configuración cuidadosa para no resolver entidades externas.
- **svgo:** es un optimizador; reescribe el archivo y por defecto renombra los `id`.
