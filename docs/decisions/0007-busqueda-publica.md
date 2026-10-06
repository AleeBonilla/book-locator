# Decisión: búsqueda pública

- **Estado:** Aceptada
- **Fecha:** 2026-10-05

## Contexto

Las decisiones [0001 §2](0001-ubicaciones-y-mapas.md#2-rangos-anidados) y [0003 §3](0003-codigos-minimo-y-publicacion.md#3-etiquetado-del-plano) definen qué debe encontrar la búsqueda y qué figura resaltar. Esta decisión fija cómo se implementa y qué responde.

## Decisión

### Quién compara

- **PostgreSQL** decide qué rangos contienen el código, y cuáles son las vecinas si cae en un hueco, comparando claves BYTEA ([`sort-key.md`](../sort-key.md)) con los índices de la migración `005-range-search-indexes.sql`. Ninguna comparación de códigos se hace en TypeScript.
- **El backend** normaliza el código buscado, calcula su clave y arma cada resultado: la ruta, la figura a resaltar y lo que queda por debajo de ella.

### Copia en memoria del esquema activo

El esquema activo siempre está publicado, y un esquema publicado no cambia: para modificarlo hay que despublicarlo, y el activo no se puede despublicar. Por eso el backend guarda en memoria su árbol de ubicaciones, los códigos dibujados en su plano y el propio plano, y los recarga solo cuando cambia el esquema activo o su fecha de publicación. Cada búsqueda hace dos consultas: una para saber cuál es el esquema activo y otra para comparar rangos (o dos si no hay coincidencias).

### Respuesta

`GET /search?code=…` es pública. Para cada resultado devuelve:

- `relation`:
  - `contains`: el rango contiene el código. Puede haber varios si los rangos se solapan.
  - `before` / `after`: el código cae en un hueco, y esta es la ubicación que termina justo antes o la que empieza justo después. En los extremos solo hay una.
- `path`: la ruta desde la raíz, con la posición de cada ubicación entre sus hermanas (`position` de `siblings`; en un mueble, 1 es el anaquel superior).
- `highlight_code`: la figura que hay que resaltar en el plano. Es la de la ubicación o la de su ancestro dibujado más cercano. Siempre existe en un esquema publicado, porque toda ubicación del mínimo está dibujada.
- `below_highlight`: el tramo de la ruta por debajo de esa figura, para describirlo con texto («Anaquel 3, tercero de arriba hacia abajo»).

Códigos de error:

| Situación | Respuesta |
|---|---|
| Código inválido según [`normalization.md`](../normalization.md) | **422**, con el motivo |
| No hay ningún esquema activo | **503** (situación prevista: no se registra como error en el log) |

### Plano público

`GET /search/map` sirve el plano del esquema activo con:

- un `ETag` que identifica esquema y publicación, para que el navegador no lo vuelva a descargar si no cambió (**304**);
- la misma política de contenido que el plano de administración, que impide ejecutar código.

## Pendiente

- **Limitar la cantidad de búsquedas por IP.** La ruta es pública; requiere decidir una dependencia (p. ej. `express-rate-limit`) o un límite en el proxy que sirva la aplicación.
