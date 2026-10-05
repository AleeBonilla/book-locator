# Decisiones de diseño: ubicaciones y mapas

- **Estado:** Aceptadas para el esquema actual
- **Fecha:** 2026-10-02
- **Modificada por:** [0003](0003-codigos-minimo-y-publicacion.md) (§4: `code` autogenerado y esquema publicado congelado; §5: etiquetado del plano y reglas de validación)

Decisiones que modifican el esquema inicial de `main` para representar estructuras físicas irregulares (secciones con distinto número de caras, ramas que terminan en mueble o en anaquel) con la menor complejidad posible.

## Cambios respecto a `main`

| Elemento en `main` | Esquema actual |
| --- | --- |
| `scheme_levels`, `locations.scheme_level_id`, estado `LEVELS_DEFINED` | Eliminados; `locations` incorpora `level`, `level_name`, `level_name_override`. |
| `schemes.ordering_profile_id` | Eliminada junto con su clave foránea. |
| `locations.range_start_normalized`, `range_end_normalized` | Eliminadas. |
| `locations.sort_order` (`DEFAULT 0`, `>= 0`) | Obligatorio, positivo y único entre hermanos. |
| `map_layers`, `map_layer_scheme_levels`, `map_layer_svgs`, `map_layer_svg_assignments`, tipos `map_layer_type` y `map_render_mode` | Eliminados; se agrega `schemes.map_svg`. |

## 1. Una sola jerarquía física

`locations` es la única jerarquía: cada ubicación tiene un padre opcional y un `level` que el backend mantiene igual a su profundidad. Se elimina `scheme_levels` porque duplicaba la estructura y dificultaba las ramas irregulares.

`name` identifica la ubicación (“Anaquel 3”); `level_name` es el nombre común del nivel (“Anaquel”) y `level_name_override` lo reemplaza en una ubicación concreta.

## 2. Rangos anidados

- No se marcan ubicaciones terminales. La búsqueda trabaja con las ubicaciones más profundas con rango (las que tienen rango y ninguno de sus hijos lo tiene) y, de cada resultado, recorre sus padres para obtener la ruta.
- Se devuelven todas las que contienen el código. Los rangos pueden solaparse, así que pueden ser varias (normalmente dos anaqueles contiguos), y se marcan todas.
- Si ninguna lo contiene porque el código cae en un hueco, se devuelven las dos vecinas: la que termina justo antes del código y la que empieza justo después. Con Anaquel 1 en `000–099` y Anaquel 2 en `150–199`, una búsqueda de `120` devuelve ambos anaqueles, no el mueble que los contiene. Si el código queda antes del primer rango o después del último, se devuelve solo esa vecina.
- Un padre puede recibir rango directamente, sin que sus hijos lo tengan. Cuando todos sus hijos tienen rango, el padre recibe el inicio del primero y el fin del último, según `sort_order`.
- No se almacena el JSON normalizado: el backend lo reproduce desde `range_*_raw` con las reglas de [`normalization.md`](../normalization.md). Se conservan `range_*_key` para la búsqueda (formato en [`sort-key.md`](../sort-key.md)); si cambian las reglas, se recalculan desde `raw`.

## 3. `sort_order` como posición entre hermanos

Se numera 1, 2, 3… entre ubicaciones con el mismo padre; en un mueble, 1 es el anaquel superior. La base exige que sea positivo y único entre hermanos (`locations_sibling_sort_unique`, con `NULLS NOT DISTINCT` para las raíces y `DEFERRABLE` para intercambiar posiciones en una transacción). El backend evita huecos en la numeración.

## 4. El árbol queda fijo mientras haya rangos

Los rangos siguen el orden físico del árbol y se guardan en la ubicación, no en su posición. Si la estructura cambia después, dejan de coincidir con los libros: al intercambiar el `sort_order` de dos anaqueles con rango, el sistema indicaría el anaquel equivocado.

Por eso, mientras alguna ubicación del esquema tenga rango, no se permite crear ni eliminar ubicaciones ni cambiar `parent_location_id`, `level`, `sort_order` o `code` (este último lo usa el SVG). Sí se pueden editar `name`, `level_name` y `level_name_override`, porque solo cambian cómo se muestra la ubicación. Al quitar todos los rangos, el árbol vuelve a ser editable. El backend aplica esta regla.

> **Actualización (0003):** `code` ya no se edita; el backend lo genera a partir de `sort_order` y lo recalcula cuando cambia la estructura. Un esquema publicado no admite ningún cambio hasta que se despublique.

## 5. Un solo plano superior

Cada esquema tiene un único plano en vista superior, guardado como SVG en `schemes.map_svg` (`TEXT`, para que no cambie por fuera del ciclo de publicación; admite `NULL` en borrador). Se eliminan la vista frontal, las capas, el *drilldown* y las variantes de SVG.

Cada figura del SVG lleva como identificador el `code` de su ubicación; se resaltan los resultados y sus ancestros que tengan figura. Toda ubicación con figura en el SVG debe tener su rango completo (inicio y fin); el backend lo valida antes de publicar. No se guarda qué niveles representa el plano, porque en ramas irregulares un mismo nivel no es el mismo tipo de estructura (el mueble es nivel 2 en Sección > Mueble y nivel 3 en Sección > Cara > Mueble). Lo que queda por debajo de la última figura se describe con texto: “Cara Norte, tercer anaquel de arriba hacia abajo”.

> **Actualización (0003):** las figuras se identifican con `id="loc-<code>"`. Ya no se exige que una ubicación con figura tenga rango propio; se exige que cada etiqueta corresponda a una ubicación existente y que toda ubicación del mínimo de asignación tenga su figura.

## 6. Sin dependencia de `ordering_profiles`

Se elimina `schemes.ordering_profile_id`.
