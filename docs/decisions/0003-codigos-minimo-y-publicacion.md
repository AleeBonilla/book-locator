# Decisiones: códigos de ubicación, mínimo de publicación y congelamiento

- **Estado:** Aceptadas, pendientes de implementar
- **Fecha:** 2026-10-05
- **Modifica:** [0001](0001-ubicaciones-y-mapas.md) §4 y §5

Estas decisiones definen cómo se identifican las ubicaciones entre la aplicación y el plano SVG, cuánto hay que asignar antes de publicar un esquema y qué se puede cambiar después. La guía para quienes dibujan los planos está en [`guia-mapas.md`](../guia-mapas.md).

## 1. Los códigos de ubicación los genera el backend

El `code` de cada ubicación se calcula; nadie lo escribe:

```text
raíz:      code = sort_order
resto:     code = code del padre + "-" + sort_order
```

Con la estructura Fila › Cara › Mueble › Anaquel:

```text
Fila 6                          6
Fila 6 › Cara 1                 6-1
Fila 6 › Cara 1 › Mueble 10     6-1-10
… › Mueble 10 › Anaquel 3       6-1-10-3
```

- **Solo dígitos y guiones.** El código es seguro dentro de un `id` de SVG y de un selector CSS, y no depende de cómo se escriban los nombres.
- **Es único dentro del esquema** porque `sort_order` es único entre hermanos (`locations_sibling_sort_unique`). Por eso `locations_scheme_code_unique` se cumple por construcción.
- **Refleja la jerarquía.** Todas las ubicaciones bajo `6-1` empiezan con `6-1-`, lo que permite resaltar un grupo completo en el plano (§3).
- **Deja de ser un campo editable.** Se recalcula, para la ubicación movida y todo su subárbol, cuando cambia la estructura: crear, eliminar, mover o reordenar. Esos cambios solo se permiten mientras el esquema no tenga rangos (0001 §4) y no esté publicado (§4).
- **Afecta al plano.** Si el esquema ya tiene un plano cargado, un cambio de estructura puede cambiar códigos que el plano usa. La aplicación lo advierte antes de aplicar el cambio, y la validación al publicar (§3) detecta las etiquetas que quedaron sin ubicación.

Los códigos son los que la persona que diseña el plano usa para etiquetar las figuras. La aplicación ofrece una **hoja de códigos** con el código, el nombre y la ruta de cada ubicación.

## 2. Mínimo de asignación para publicar

Se agrega `locations.range_required BOOLEAN NOT NULL DEFAULT false`. Las ubicaciones marcadas forman el **mínimo de asignación**: el nivel hasta el que tienen que existir rangos para poder publicar.

- **Cobertura.** En cada camino desde una raíz hasta una hoja hay **exactamente una** ubicación marcada. Así el mínimo cubre toda la estructura, sin huecos ni marcas anidadas. Como se guarda por ubicación, funciona en ramas irregulares, donde un mismo tipo de estructura queda a distinta profundidad.
- **Requisito.** Cada ubicación marcada debe tener rango completo, cargado directamente o recibido de sus hijos según 0001 §2.
- **Rangos más finos.** Debajo del mínimo se pueden cargar rangos de forma opcional. Por ejemplo, con el mínimo en los muebles, se pueden cargar algunos anaqueles. La búsqueda usa siempre las ubicaciones más profundas que tengan rango (0001 §2).
- **Marcado por nivel.** La aplicación permite marcar o desmarcar de una vez todas las ubicaciones con un mismo `level_name` («marcar todos los *Mueble*»), pero lo que se guarda es la marca de cada ubicación.

Un anaquel vacío no impide publicar si el mínimo está por encima de él.

### Estado del esquema

El backend calcula el estado siempre; no se elige a mano.

| Estado | Condición |
|---|---|
| `DRAFT` | No tiene ubicaciones. |
| `LOCATIONS_DEFINED` | Tiene ubicaciones y ningún rango. |
| `PARTIALLY_ASSIGNED` | Tiene algún rango, pero el mínimo no está completo o las marcas no cumplen la cobertura. |
| `ASSIGNED` | Las marcas cumplen la cobertura y todas las ubicaciones marcadas tienen rango. |

## 3. Etiquetado del plano

Una figura del SVG se asocia a una ubicación únicamente por su `id`, con el formato:

```text
id="loc-<código>"        p. ej. id="loc-6-1-10"
```

- **Por qué el `id`.** Todas las herramientas de diseño permiten nombrar objetos y exportan ese nombre como `id`; casi ninguna permite agregar otros atributos.
- **Por qué el prefijo `loc-`.** Distingue las etiquetas de los demás `id` que genera la herramienta (`Frame 2 5`, `image 1`). Además, evita que el `id` empiece con un dígito, cosa que algunas herramientas alteran al exportar (Illustrator, por ejemplo, escribe `_x36_` en lugar de `6`).
- **No se usa ningún otro atributo.** El `data-location-code` del plano de ejemplo lo agregó un script; ese plano debe volver a etiquetarse (`data-location-code="6-6-1-10"` pasa a ser `id="loc-6-1-10"`).

### Qué se valida

Esto reemplaza la regla de 0001 §5 según la cual «toda ubicación con figura debe tener su rango completo»:

| Situación | Resultado |
|---|---|
| Etiqueta `loc-…` con un código que no existe en el esquema | Error, no se puede publicar |
| Etiqueta `loc-…` mal formada (p. ej. `loc-6-1-10 2`, típica de una capa duplicada) | Error |
| Dos figuras con la misma etiqueta | Imposible: el `id` es único; la herramienta renombra la segunda y cae en el caso anterior |
| SVG con contenido no permitido (ver la guía) o sin `viewBox` | Error, el archivo se rechaza al subirlo |
| Ubicación marcada del mínimo sin ninguna figura en su rama (ni ella, ni un ancestro, ni un descendiente) | Advertencia: se publica, pero esa zona solo se describe con texto |

Una figura no necesita rango propio. Al buscar, si el resultado es la ubicación `L`:

1. si `L` tiene figura, se resalta esa figura;
2. si no, y algún ancestro de `L` tiene figura, se resalta el ancestro más cercano (p. ej. el mueble que contiene un anaquel);
3. si no, y hay descendientes de `L` con figura, se resaltan todos (`[id^="loc-6-1-"]`, para una cara). El guion final es necesario para que `6-1` no coincida con `6-10`;
4. si nada de su rama está dibujado, el resultado se describe solo con texto.

## 4. Publicación, congelamiento y copias

- **Congelado.** Un esquema publicado no admite cambios de estructura, rangos, marcas ni plano.
- **Despublicar.** Elimina `published_by` y `published_at` y vuelve a permitir cambios. No se puede despublicar el esquema activo: primero hay que activar otro, para que la búsqueda pública nunca se quede sin esquema.
- **Activar.** Solo se puede activar un esquema publicado. La base de datos ya exige `ASSIGNED` para activar (`schemes_active_valid`); el backend exige además la publicación.
- **Copiar (recomendado para cambios).** Crea un esquema nuevo, sin publicar ni activar, con la misma estructura, códigos, marcas, rangos y plano. Se trabaja sobre la copia, se publica y se activa; la activación desactiva al anterior en la misma transacción. El esquema anterior queda publicado como historial.
