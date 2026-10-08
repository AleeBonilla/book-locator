# Historias de usuario

Historias principales implementadas en BJFF Book Locator, agrupadas por quién las usa. Cada una indica qué la cumple y dónde está definida o implementada.

**Estado de cada parte**

- **Backend:** API en `apps/api`, en `main`, con pruebas automáticas.
- **Frontend:** prototipos en `apps/web`, sin conexión al backend todavía (ramas `frontend-design` y `frontend-admin`, en revisión).

## Lectores (búsqueda pública)

### 1. Encontrar dónde está un libro

**Como** lector, **quiero** escribir el código de clasificación de un libro **para** saber en qué mueble de la biblioteca buscarlo.

- La búsqueda no requiere iniciar sesión.
- El plano marca el mueble en rojo y una flecha animada lo señala, con cualquier nivel de zoom.
- La respuesta no usa terminología interna (filas, caras, códigos de ubicación ni rangos): dice «Está en el mueble marcado en el plano».
- El código se puede escribir como aparece en el catálogo, con o sin espacios, guiones, superíndices o puntos de más (`001.42 H557m4`, `001.42H557m^4`).
- La búsqueda viaja en la dirección (`?codigo=…`), así se puede recargar o compartir.

*Backend:* `GET /search` (decisión 0007). *Frontend:* `apps/web/src/pages/SearchPage.tsx`.

### 2. Saber en qué anaquel buscar

**Como** lector, **quiero** que me indiquen el anaquel **para** no revisar el mueble entero.

- Si hay rangos cargados por anaquel, se indica cuál, contando desde arriba («Tercer anaquel, contando desde arriba, de 5»), con un dibujo del mueble.
- Si el libro puede estar en dos anaqueles cuyos rangos se superponen, se indican los dos.
- Si los rangos solo están cargados por mueble, se indica el mueble y no se menciona ningún anaquel.

*Backend:* campos `below_highlight` y `path` de `GET /search`. *Frontend:* `components/SearchResults.tsx`.

### 3. Orientarme cuando el código no tiene un lugar asignado

**Como** lector, **quiero** saber dónde debería estar un libro aunque su código caiga entre dos rangos **para** poder buscarlo igual.

- Se marcan en turquesa las ubicaciones vecinas: la que termina justo antes y la que empieza justo después.
- En los extremos de la colección se indica solo la vecina que existe.

*Backend:* `relation: before | after` en `GET /search` (decisión 0001 §2).

### 4. Entender por qué no se encontró un código

**Como** lector, **quiero** que me expliquen si escribí mal el código **para** poder corregirlo.

- Un código que no se puede interpretar responde con un mensaje claro y un ejemplo de cómo escribirlo.

*Backend:* `normalization.md` y respuesta 422 de `GET /search`.

### 5. Recorrer el plano

**Como** lector, **quiero** acercar, alejar y desplazar el plano **para** ubicarme en la sala.

- Funciona con la rueda del mouse, arrastrando, con dos dedos, con doble clic, con el teclado y con botones.
- Al buscar, el plano se acerca solo al resultado, sin quedar tapado por el panel ni por los controles.
- En celular, el plano queda arriba y el resultado en una hoja inferior.

*Frontend:* `components/MapCanvas.tsx`.

## Personal de la biblioteca (administración)

### 6. Iniciar y cerrar sesión

**Como** integrante del personal, **quiero** iniciar sesión con mi usuario o correo **para** acceder a la administración.

- Las contraseñas se guardan con argon2id; la sesión vive en una cookie `HttpOnly`.
- Un error no revela si el usuario existe.
- Las rutas de administración responden 401 sin sesión.

*Backend:* `/auth/login`, `/auth/logout`, `/auth/me`. *Frontend:* `pages/LoginPage.tsx`.

### 7. Administrar esquemas

**Como** personal, **quiero** crear y listar esquemas de la sala **para** preparar cambios sin afectar lo que ven los lectores.

- La lista muestra el estado en palabras: «En uso», «Faltan rangos», «Sin rangos», «Listo para publicar».

*Backend:* `GET/POST/PATCH /schemes`. *Frontend:* `pages/admin/SchemesPage.tsx`.

### 8. Armar la estructura física

**Como** personal, **quiero** describir la sala como un árbol de ubicaciones (fila, cara, mueble, anaquel…) **para** reflejar cómo está organizada.

- Los códigos de ubicación (`6-1-10`) se generan solos a partir de la posición y se recalculan al mover, reordenar o eliminar.
- Las ramas pueden ser irregulares.
- La estructura queda fija mientras haya rangos asignados.

*Backend:* `/schemes/:id/locations`, `/locations/:id` y `/move`; migraciones 003 y 004 (decisión 0003 §1). *Frontend:* `components/admin/LocationTree.tsx` y `LocationPanel.tsx`.

### 9. Definir el mínimo para publicar

**Como** personal, **quiero** indicar hasta qué nivel deben estar cargados los rangos **para** poder publicar sin tener que cargar cada anaquel.

- El mínimo se marca por nivel («todos los muebles») y se guarda por ubicación.
- Se acepta en ramas irregulares, siempre con una sola marca por camino.

*Backend:* `PUT /schemes/:id/range-required`; columna `range_required` (decisión 0003 §2).

### 10. Cargar los rangos de clasificación

**Como** personal, **quiero** asignar a cada ubicación el primer y el último código que contiene **para** que la búsqueda sepa dónde está cada libro.

- Cada código se valida con las reglas de normalización y muestra el motivo si es inválido.
- El inicio no puede ir después del fin según las reglas de ordenamiento, no como texto.
- Cuando todos los hijos de una ubicación tienen rango, el de la ubicación se calcula solo.
- En el panel, los anaqueles de un mueble se cargan de corrido con Tab y se guardan solos al salir de la fila.

*Backend:* `PUT/DELETE /locations/:id/range` (decisión 0005). *Frontend:* `components/admin/RangeRow.tsx`.

### 11. Saber qué falta para publicar

**Como** personal, **quiero** ver qué le falta a un esquema **para** completarlo sin adivinar.

- El estado (`DRAFT` → `ASSIGNED`) lo calcula el sistema.
- El reporte indica, por código, las ubicaciones sin rango, las ramas sin marca y los problemas del plano.
- En el panel, los cuatro pasos (estructura, rangos, plano, publicación) llevan a lo pendiente, y el árbol muestra «Faltan N» por rama.

*Backend:* `assignment` en `GET /schemes/:id`. *Frontend:* `components/admin/SchemeSteps.tsx`.

### 12. Cargar el plano de la sala

**Como** personal, **quiero** subir el plano en SVG **para** que los lectores vean dónde están los muebles.

- Se puede validar un archivo sin guardarlo.
- El reporte indica las ubicaciones obligatorias sin dibujar, las figuras con códigos inexistentes y las etiquetas mal escritas.
- Un SVG con contenido peligroso se rechaza indicando la línea.
- Se puede descargar la hoja de códigos (CSV) para quien diseña el plano.

*Backend:* `/schemes/:id/map`, `/map/validate`, `/map/report`, `/codes` (decisión 0006). *Frontend:* `components/admin/MapTab.tsx`.

### 13. Publicar y poner en uso un esquema

**Como** personal, **quiero** publicar un esquema completo y activarlo **para** que la búsqueda pública lo use.

- Solo se publica con el mínimo asignado y un plano completo; si falta algo, se explica qué.
- Un esquema publicado no se puede editar.
- Solo hay un esquema en uso a la vez, y no se puede despublicar mientras esté en uso.
- Activar pide confirmación.

*Backend:* `/schemes/:id/publish`, `/unpublish`, `/activate` (decisión 0003 §4).

### 14. Preparar cambios sobre un esquema en uso

**Como** personal, **quiero** copiar un esquema publicado **para** editarlo sin afectar la búsqueda hasta que la copia esté lista.

- La copia conserva la estructura, los códigos, las marcas, los rangos y el plano, y nace sin publicar.
- Al activarla, el esquema anterior deja de estar en uso.

*Backend:* `POST /schemes/:id/copy`.

## Diseño de planos

### 15. Dibujar el plano con cualquier herramienta

**Como** persona que diseña el plano, **quiero** reglas claras para etiquetar las figuras **para** que el plano funcione sin depender de una herramienta.

- Cada figura se etiqueta con el nombre de capa `loc-<código>`, copiado de la hoja de códigos.
- La guía explica qué está permitido y qué no, cómo exportar desde Figma, Inkscape e Illustrator, y qué significa cada mensaje del reporte.

*Documentación:* `docs/guia-mapas.md`.

## Requisitos del sistema

### 16. Comparar códigos según las reglas de la biblioteca

**Como** biblioteca, **queremos** que los códigos se ordenen según nuestras reglas (prefijo, DDC, Cutter, edición) y no alfabéticamente **para** que la búsqueda sea exacta.

- Cada código se normaliza y se convierte en una clave binaria (`BYTEA`) que PostgreSQL compara directamente.
- `S248 < S25`, `q6 < q10`, `999 < A863`; la Ñ va entre la N y la O.

*Documentación:* `docs/normalization.md`, `docs/classification-ordering.md`, `docs/sort-key.md`. *Código:* `packages/classification` (paquete `@bjff/classification`, compartido por la API y la web).

### 17. Mostrar planos sin riesgos

**Como** biblioteca, **queremos** que un plano subido no pueda ejecutar código en las pantallas de los lectores.

- El backend valida el SVG con una lista blanca (saxes), y el navegador lo vuelve a limpiar con DOMPurify.
- El plano se sirve con una política de contenido que bloquea scripts.

*Documentación:* decisión 0006.

## Pendiente

- Conectar el frontend con la API.
- Importar los rangos desde el Excel de la colección.
- Limitar la cantidad de búsquedas por IP (decisión 0007, pendiente).
